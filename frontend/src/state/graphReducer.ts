/**
 * Reducer for the graph slice of global app state: the concept-graph node/edge
 * set plus traversal highlight/selection state. Pure and independently
 * unit-testable per the project's global-state design (Issue 2).
 */
import type { GraphState, GraphAction } from "./types";

/** The empty graph state used on initial load and after a RESET_GRAPH action. */
export const initialGraphState: GraphState = {
  nodes: [],
  edges: [],
  highlightedNodeIds: [],
  highlightedEdgeIds: [],
  selectedNodeId: null,
};

/**
 * Computes the next graph state for a given action without mutating the
 * previous state.
 * - ADD_NODE appends a single node.
 * - SET_GRAPH bulk-replaces the node/edge lists (used for an initial graph load).
 * - RESET_GRAPH clears nodes, edges, and any highlight/selection state.
 * - HIGHLIGHT_NODE appends a node id (and optional edge id) to the live
 *   traversal highlight trail, without duplicating already-highlighted ids
 *   (Issue 10).
 * - CLEAR_HIGHLIGHT empties the highlight trail once a traversal completes (Issue 10).
 * - ADD_EDGES appends newly-discovered edges without replacing the existing
 *   list (Issue 7).
 * - SELECT_NODE sets or clears (null) the node-detail HUD overlay's target (Issue 8).
 */
export function graphReducer(state: GraphState, action: GraphAction): GraphState {
  switch (action.type) {
    case "ADD_NODE":
      return { ...state, nodes: [...state.nodes, action.node] };
    case "SET_GRAPH":
      return { ...state, nodes: action.nodes, edges: action.edges };
    case "RESET_GRAPH":
      return { ...initialGraphState };
    case "HIGHLIGHT_NODE": {
      const highlightedNodeIds = state.highlightedNodeIds.includes(action.nodeId)
        ? state.highlightedNodeIds
        : [...state.highlightedNodeIds, action.nodeId];
      const highlightedEdgeIds =
        action.edgeId && !state.highlightedEdgeIds.includes(action.edgeId)
          ? [...state.highlightedEdgeIds, action.edgeId]
          : state.highlightedEdgeIds;
      return { ...state, highlightedNodeIds, highlightedEdgeIds };
    }
    case "CLEAR_HIGHLIGHT":
      return { ...state, highlightedNodeIds: [], highlightedEdgeIds: [] };
    case "ADD_EDGES":
      return { ...state, edges: [...state.edges, ...action.edges] };
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.nodeId };
    default:
      return state;
  }
}
