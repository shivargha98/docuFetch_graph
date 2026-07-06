/**
 * Polls GET /api/graph on the same cadence as useIngestionStatus (the shipped
 * backend has no ingestion-event push channel -- see
 * docs/frontend/frontend_context.md decision D3) and diffs the returned
 * node/edge set against the live graph state, dispatching ADD_NODE (existing,
 * Round 1 action) for each genuinely new node id and ADD_EDGES (Issue 7, see
 * ../state/types.ts) for any newly-discovered edges. Additive only -- never
 * dispatches SET_GRAPH -- so an already-rendered scene's existing nodes,
 * their live simulated positions, and any traversal-highlight/selection state
 * are left completely undisturbed when new concepts are ingested.
 *
 * Also tracks, per newly-added node id, the timestamp it was first seen, in a
 * ref (not React state, since no re-render is needed to drive it -- see
 * GraphView.tsx, which reads this ref once per rendered frame via
 * `nodePositionUpdate` to animate a scale-based pop-in for nodes still within
 * their fade window) with a short TTL after which the entry is removed and
 * the node is considered fully "settled".
 * Source: Feature: Live Node Fade-In on Ingestion (docs/frontend/features.md), Issue 7.
 */
import { useEffect, useRef } from "react";
import { useGraphState, useIngestionState } from "../state/providers";
import type { GraphNode, GraphEdge } from "../state/types";

/** Poll interval for GET /api/graph, matching useIngestionStatus's cadence. */
const POLL_INTERVAL_MS = 2500;

/** How long a newly-added node is considered "new" (drives GraphView's pop-in animation duration). */
export const FADE_DURATION_MS = 650;

/** Shape of the `GET /api/graph` response body. */
interface GraphReadResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Builds a stable identity key for an edge, so an edge is only considered "new" if its full (source, target, relation) triple hasn't been seen before. */
function edgeKey(edge: GraphEdge): string {
  return `${edge.source}->${edge.target}:${edge.relation}`;
}

/**
 * Starts (and restarts on folder change) a poll loop against GET /api/graph,
 * appending any newly-seen nodes/edges to graph state as they're discovered.
 * Returns a ref to the live map of node id -> first-seen timestamp (ms, per
 * `Date.now()`) for nodes still within their fade window; GraphView reads
 * `.current` directly inside its per-frame render callback rather than via
 * React state, since the animation itself is driven by three.js's own render
 * loop, not React's.
 */
export function useNodeFadeIn(): React.RefObject<Map<string, number>> {
  const { state, dispatch } = useGraphState();
  const { state: ingestionState } = useIngestionState();
  const folderPath = ingestionState.folderPath;

  // Mirrors the latest graph state into a ref so the poll callback (captured
  // once per effect run, on an interval outside React's render cycle) always
  // diffs against the current node/edge lists rather than a stale closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  const fadeMapRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!folderPath) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/graph");
        if (cancelled || !res.ok) return;
        const body: GraphReadResponse = await res.json();
        const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
        const edges = Array.isArray(body?.edges) ? body.edges : [];

        const knownNodeIds = new Set(stateRef.current.nodes.map((n) => n.id));
        const addedNodes = nodes.filter((node) => !knownNodeIds.has(node.id));
        addedNodes.forEach((node) => dispatch({ type: "ADD_NODE", node }));

        const knownEdgeKeys = new Set(stateRef.current.edges.map(edgeKey));
        const addedEdges = edges.filter((edge) => !knownEdgeKeys.has(edgeKey(edge)));
        if (addedEdges.length > 0) dispatch({ type: "ADD_EDGES", edges: addedEdges });

        const addedAt = Date.now();
        addedNodes.forEach((node) => {
          fadeMapRef.current.set(node.id, addedAt);
          setTimeout(() => {
            if (!cancelled) fadeMapRef.current.delete(node.id);
          }, FADE_DURATION_MS);
        });
      } catch {
        // Same posture as useIngestionStatus: skip this cycle and try again
        // on the next tick rather than surfacing an error state.
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [folderPath, dispatch]);

  return fadeMapRef;
}
