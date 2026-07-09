/**
 * Integration tests for NodeDetailOverlay's interaction with the graph: linking
 * to another concept, and staying anchored to its node without drift while the
 * camera orbits/zooms. Pure rendering of the overlay's own content is covered
 * in tests/unit/NodeDetailOverlay.test.tsx.
 * Source: Feature: Node Click HUD Detail Overlay (docs/frontend/features.md), Issue 8.
 *
 * Uses the same `vi.mock("react-force-graph-2d", ...)` capture-props pattern
 * documented by the graph3d/traversal worker reports: the mock never invokes
 * the `ref` callback prop, so `fgRef.current` stays undefined here exactly as
 * it does under every other GraphView test in this suite -- `onNodeClick` is
 * instead invoked directly from the captured props to simulate a real click.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import { mockFetch, resetAllMocks } from "../setup";
import { AppProviders, useGraphState, useIngestionState } from "../../src/state/providers";
import { GraphView, reprojectNodeToScreen } from "../../src/components/graph/GraphView";
import type { GraphState } from "../../src/state/types";

interface CapturedProps {
  onNodeClick?: (node: { id: string }) => void;
}

let capturedProps: CapturedProps | undefined;

vi.mock("react-force-graph-2d", () => ({
  default: (props: CapturedProps) => {
    capturedProps = props;
    return null;
  },
}));

afterEach(() => {
  resetAllMocks();
  cleanup();
  capturedProps = undefined;
});

/** Builds a stubbed GET /api/graph response with two nodes joined by one edge. */
function graphResponse() {
  return {
    status: 200,
    body: {
      nodes: [
        { id: "n1", name: "Alpha", description: "Alpha desc", source_files: ["a.md"] },
        { id: "n2", name: "Beta", description: "Beta desc", source_files: ["b.md"] },
      ],
      edges: [{ source: "n1", target: "n2", relation: "related_to" }],
    },
  };
}


/** Seeds an active folder so GraphView's folder-gated graph fetch runs (no folder -> no graph). */
function FolderSeed() {
  const { dispatch } = useIngestionState();
  useEffect(() => {
    dispatch({ type: "RESET_FOLDER", folderPath: "/docs" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Mounts GraphView and exposes live graph state via a ref, for the test to assert on directly. */
function Harness({ apiRef }: { apiRef: { current: GraphState | null } }) {
  const { state } = useGraphState();
  apiRef.current = state;
  return <GraphView />;
}

describe("NodeDetailOverlayInteraction", () => {
  it("highlights/selects the linked concept in the graph when its link is clicked inside the overlay", async () => {
    /**
     * Given an open overlay for a node with at least one linked concept,
     * when a linked-concept link is clicked,
     * then the corresponding node in the graph becomes highlighted/selected.
     *
     * Source: Feature: Node Click HUD Detail Overlay — criterion 2
     */
    mockFetch({ graphRead: graphResponse() });
    const apiRef: { current: GraphState | null } = { current: null };

    render(
      <AppProviders>
        <FolderSeed />
        <Harness apiRef={apiRef} />
      </AppProviders>
    );

    await waitFor(() => expect(apiRef.current!.nodes).toHaveLength(2));

    act(() => {
      capturedProps!.onNodeClick!({ id: "n1" });
    });

    expect(screen.getByTestId("node-detail-overlay")).toBeInTheDocument();
    expect(apiRef.current!.selectedNodeId).toBe("n1");

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(apiRef.current!.selectedNodeId).toBe("n2");
  });

  it("keeps the overlay anchored near its node without drift as the camera orbits/zooms", () => {
    /**
     * Given an open overlay anchored to a node at a known 3D position,
     * when the camera's orbit/zoom state changes (mocked reprojection input),
     * then the overlay's computed 2D screen position updates to match the
     * node's reprojected position each time the camera state changes.
     *
     * Source: Feature: Node Click HUD Detail Overlay — criterion 3
     *
     * Note: this test uses a mocked camera-state/reprojection input rather than
     * a real three.js/WebGL render loop — see docs/frontend/tests.md's Gaps
     * section for why a true rendering-accuracy check was not added here.
     * `reprojectNodeToScreen` is the exact pure function GraphView calls from
     * its `onEngineTick` handler on every rendered frame.
     */
    const node = { x: 10, y: 20 };

    const cameraStateA = { graph2ScreenCoords: () => ({ x: 120, y: 80 }) };
    expect(reprojectNodeToScreen(cameraStateA, node)).toEqual({ x: 120, y: 80 });

    // Simulates the camera having orbited/zoomed: the same node now
    // reprojects to a different screen position.
    const cameraStateB = { graph2ScreenCoords: () => ({ x: 340, y: 210 }) };
    expect(reprojectNodeToScreen(cameraStateB, node)).toEqual({ x: 340, y: 210 });

    // No ForceGraph instance available (e.g. WebGL unavailable) -- no position.
    expect(reprojectNodeToScreen(undefined, node)).toBeNull();
  });
});
