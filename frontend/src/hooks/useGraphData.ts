/**
 * Fetches the concept graph for the currently configured folder from the
 * backend's graph-read endpoint and syncs it into the shared graph slice via
 * SET_GRAPH. Refetches whenever the active ingestion folder path changes, so
 * GraphView (the sole reader of graph state) always reflects whichever
 * folder is currently loaded. One fetch per folder load -- no polling.
 */
import { useEffect } from "react";
import { useGraphState, useIngestionState } from "../state/providers";
import type { GraphNode, GraphEdge } from "../state/types";

/** Shape of the `GET /api/graph` response body. */
interface GraphReadResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Loads the graph for the active folder into global graph state. Call once
 * from GraphView; has no return value since consumers read graph data via
 * `useGraphState()` rather than from this hook directly.
 */
export function useGraphData(): void {
  const { dispatch } = useGraphState();
  const { state: ingestionState } = useIngestionState();
  const { folderPath } = ingestionState;

  useEffect(() => {
    // No active folder, no graph: with nothing selected there is nothing to
    // show — fetching here used to render a previous session's stale
    // persisted graph as if something were being watched.
    if (!folderPath) return;
    fetch("/api/graph")
      .then((res) => res.json())
      .then((data: GraphReadResponse) => {
        dispatch({ type: "SET_GRAPH", nodes: data.nodes, edges: data.edges });
      })
      // Swallow fetch failures: this round has no error-state UI (only the
      // success and empty-graph paths are in scope), and an unhandled
      // rejection here would otherwise surface in every test/page that
      // mounts GraphView without stubbing fetch.
      .catch(() => {});
  }, [folderPath, dispatch]);
}
