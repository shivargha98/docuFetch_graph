/**
 * Integration tests for useGraphData, which fetches the current graph from the
 * backend's graph-read endpoint and feeds it to the 3D scene.
 * Source: Feature: 3D Graph Rendering & Initial Load (docs/frontend/features.md), Issue 6.
 *
 * Caveat: the mocked graph-read response shape used throughout this file is
 * illustrative and provisional, pending backend Issue 16 (including how/whether
 * pagination is handled for large graphs).
 *
 * the canvas renderer isn't exercised in jsdom, so react-force-graph-2d cannot actually render here. It
 * is mocked with a lightweight stand-in that records whatever `graphData` and
 * link-accessor props (linkColor, linkWidth, etc.) GraphView passes down --
 * that recorded value is what these tests assert against. Later rounds
 * (traversal highlight, node fade-in, HUD overlay) can reuse this same mock
 * pattern for their own GraphView-rendering tests.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { mockFetch, resetAllMocks } from "../setup";
import { AppProviders, useIngestionState } from "../../src/state/providers";
import { GraphView } from "../../src/components/graph/GraphView";
import { relationTypeToEdgeStyle } from "../../src/lib/edgeStyles";
import type { GraphNode, GraphEdge } from "../../src/state/types";

/** The subset of ForceGraph3D props this test suite inspects. */
interface CapturedProps {
  graphData: { nodes: GraphNode[]; links: GraphEdge[] };
  linkColor: (link: GraphEdge) => string;
  linkWidth: (link: GraphEdge) => number;
  linkDirectionalParticles: (link: GraphEdge) => number;
  linkDirectionalParticleColor: (link: GraphEdge) => string;
}

let capturedProps: CapturedProps | null = null;

/** Seeds an active folder so GraphView's folder-gated graph fetch runs (no folder -> no graph). */
function FolderSeed() {
  const { dispatch } = useIngestionState();
  useEffect(() => {
    dispatch({ type: "RESET_FOLDER", folderPath: "/docs" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}


vi.mock("react-force-graph-2d", () => ({
  default: (props: CapturedProps) => {
    capturedProps = props;
    return null;
  },
}));

afterEach(() => {
  resetAllMocks();
  cleanup();
  capturedProps = null;
});

const NODES: GraphNode[] = [
  { id: "n1", name: "Alpha", description: "first concept", source_files: ["a.md"] },
  { id: "n2", name: "Beta", description: "second concept", source_files: ["b.md"] },
  { id: "n3", name: "Gamma", description: "third concept", source_files: ["c.md"] },
];

const EDGES: GraphEdge[] = [
  { source: "n1", target: "n2", relation: "is_a" },
  { source: "n2", target: "n3", relation: "depends_on" },
  { source: "n1", target: "n3", relation: "inspired the design of" },
];

describe("useGraphData", () => {
  it("renders all persisted nodes and edges returned for the active folder on load", async () => {
    /**
     * Given fetch is mocked to return a graph payload with several nodes and
     * typed edges for the graph-read endpoint,
     * when the hook loads the graph for the active folder,
     * then all returned nodes and edges are present in the rendered scene.
     *
     * Source: Feature: 3D Graph Rendering & Initial Load — criterion 1
     */
    mockFetch({ graphRead: { status: 200, body: { nodes: NODES, edges: EDGES } } });

    render(
      <AppProviders>
        <FolderSeed />
        <GraphView />
      </AppProviders>,
    );

    await waitFor(() => expect(capturedProps?.graphData.nodes).toEqual(NODES));
    expect(capturedProps?.graphData.links).toEqual(EDGES);
  });

  it("renders each edge with a visual treatment reflecting its relation-type label", async () => {
    /**
     * Given a mocked graph payload where edges carry different relation-type labels,
     * when the graph renders,
     * then each edge's rendered treatment corresponds to its relation-type label.
     *
     * Source: Feature: 3D Graph Rendering & Initial Load — criterion 2
     */
    mockFetch({ graphRead: { status: 200, body: { nodes: NODES, edges: EDGES } } });

    render(
      <AppProviders>
        <FolderSeed />
        <GraphView />
      </AppProviders>,
    );

    await waitFor(() => expect(capturedProps).not.toBeNull());

    for (const edge of EDGES) {
      const expected = relationTypeToEdgeStyle(edge.relation);
      expect(capturedProps?.linkColor(edge)).toBe(expected.color);
      expect(capturedProps?.linkWidth(edge)).toBe(expected.width);
      expect(capturedProps?.linkDirectionalParticles(edge)).toBe(expected.particles);
      expect(capturedProps?.linkDirectionalParticleColor(edge)).toBe(expected.particleColor);
    }
  });

  it("renders an empty scene without erroring when the folder has no graph yet", async () => {
    /**
     * Given fetch is mocked to return an empty nodes/edges payload,
     * when the hook loads the graph,
     * then the scene renders with zero nodes/edges and no error is thrown.
     *
     * Source: Feature: 3D Graph Rendering & Initial Load — criterion 4
     */
    mockFetch({ graphRead: { status: 200, body: { nodes: [], edges: [] } } });

    expect(() =>
      render(
        <AppProviders>
          <GraphView />
        </AppProviders>,
      ),
    ).not.toThrow();

    await waitFor(() => expect(capturedProps).not.toBeNull());
    expect(capturedProps?.graphData.nodes).toEqual([]);
    expect(capturedProps?.graphData.links).toEqual([]);
    expect(screen.getByTestId("graph-view")).toBeInTheDocument();
  });
});
