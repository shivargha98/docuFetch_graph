/**
 * Tests for GeneratingOverlay, the "graph is generating" scanning overlay shown
 * on the graph viewport while a folder switch/upload's ingestion is running.
 * Covers: the presentational overlay's headline + live concept counter, and its
 * lifecycle inside GraphView (present only while the graph slice's `generating`
 * flag is set, counter tracking the live node count).
 * Source: Task 9 of docs/superpowers/plans/2026-07-06-folder-selection-rework.md.
 *
 * GraphView-mounting tests reuse the suite's standard
 * `vi.mock("react-force-graph-2d", ...)` capture-props stand-in (jsdom has no
 * WebGL) — see tests/integration/useGraphData.test.tsx.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { mockFetch, resetAllMocks } from "../setup";
import { AppProviders, useGraphState, useIngestionState } from "../../src/state/providers";
import { GeneratingOverlay } from "../../src/components/graph/GeneratingOverlay";
import { GraphView } from "../../src/components/graph/GraphView";
import type { GraphAction } from "../../src/state/types";

vi.mock("react-force-graph-2d", () => ({
  default: () => null,
}));

afterEach(() => {
  resetAllMocks();
  cleanup();
});

describe("GeneratingOverlay", () => {
  it("renders the headline and the live concept counter for the given node count", () => {
    /**
     * Given a node count of 12,
     * when the overlay renders,
     * then the "Generating graph" headline and a "12 concepts discovered"
     * counter are visible.
     */
    render(<GeneratingOverlay nodeCount={12} />);

    expect(screen.getByText("Generating graph")).toBeInTheDocument();
    expect(screen.getByText("12 concepts discovered")).toBeInTheDocument();
  });

  it("updates the counter when the node count changes", () => {
    /**
     * Given a mounted overlay showing 0 concepts,
     * when the nodeCount prop advances to 5,
     * then the counter text updates to match.
     */
    const { rerender } = render(<GeneratingOverlay nodeCount={0} />);
    expect(screen.getByText("0 concepts discovered")).toBeInTheDocument();

    rerender(<GeneratingOverlay nodeCount={5} />);
    expect(screen.getByText("5 concepts discovered")).toBeInTheDocument();
  });

  it("never intercepts pointer events aimed at the scene beneath it", () => {
    /**
     * Given the overlay is rendered,
     * then its root carries pointer-events-none so orbit/zoom/click still
     * reach the WebGL canvas below.
     */
    render(<GeneratingOverlay nodeCount={3} />);
    expect(screen.getByTestId("generating-overlay").className).toContain("pointer-events-none");
  });
});


/** Seeds an active folder so GraphView's folder-gated graph fetch runs (no folder -> no graph). */
function FolderSeed() {
  const { dispatch } = useIngestionState();
  useEffect(() => {
    dispatch({ type: "RESET_FOLDER", folderPath: "/docs" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Mounts GraphView and exposes graph dispatch, so tests can drive the `generating` flag directly. */
function Harness({ dispatchRef }: { dispatchRef: { current: ((action: GraphAction) => void) | null } }) {
  const { dispatch } = useGraphState();
  dispatchRef.current = dispatch;
  return <GraphView />;
}

describe("GeneratingOverlay lifecycle in GraphView", () => {
  it("appears while `generating` is set and disappears when it clears", async () => {
    /**
     * Given a mounted GraphView with an empty graph,
     * when GENERATING_START is dispatched, the overlay appears (and the
     * empty-state hint is suppressed); when GENERATING_END is dispatched,
     * the overlay is removed.
     */
    mockFetch({ graphRead: { status: 200, body: { nodes: [], edges: [] } } });
    const dispatchRef: { current: ((action: GraphAction) => void) | null } = { current: null };

    render(
      <AppProviders>
        <FolderSeed />
        <Harness dispatchRef={dispatchRef} />
      </AppProviders>
    );

    expect(screen.queryByTestId("generating-overlay")).not.toBeInTheDocument();

    act(() => {
      dispatchRef.current!({ type: "GENERATING_START" });
    });
    expect(screen.getByTestId("generating-overlay")).toBeInTheDocument();
    expect(screen.queryByText(/No graph loaded yet/)).not.toBeInTheDocument();

    act(() => {
      dispatchRef.current!({ type: "GENERATING_END" });
    });
    expect(screen.queryByTestId("generating-overlay")).not.toBeInTheDocument();
  });

  it("shows the live node count as nodes arrive while generating", async () => {
    /**
     * Given GraphView is generating and the graph fetch returns two nodes,
     * when the nodes land in graph state,
     * then the overlay counter reads "2 concepts discovered".
     */
    mockFetch({
      graphRead: {
        status: 200,
        body: {
          nodes: [
            { id: "n1", name: "Alpha", description: "a", source_files: ["a.md"] },
            { id: "n2", name: "Beta", description: "b", source_files: ["b.md"] },
          ],
          edges: [],
        },
      },
    });
    const dispatchRef: { current: ((action: GraphAction) => void) | null } = { current: null };

    render(
      <AppProviders>
        <FolderSeed />
        <Harness dispatchRef={dispatchRef} />
      </AppProviders>
    );

    act(() => {
      dispatchRef.current!({ type: "GENERATING_START" });
    });

    await waitFor(() => expect(screen.getByText("2 concepts discovered")).toBeInTheDocument());
  });
});
