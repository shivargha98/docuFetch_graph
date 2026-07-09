/**
 * Shared state, action, and domain types for docuFetch Graph's global app state
 * (React Context + useReducer, one reducer per concern: graph, chat, ingestion).
 * These types are the frozen contract later workers (graph rendering, chat UI,
 * folder input, WebSocket wiring) build against — field names for graph nodes/
 * edges and chat trace steps intentionally mirror the finalized backend contracts:
 *   GET /api/graph        -> { nodes: [{id,name,description,source_files}], edges: [{source,target,relation}] }
 *   WS  /ws/chat visit_node -> { node_id, concept, hop, via_relation }
 */

// ---------------------------------------------------------------------------
// Graph slice
// ---------------------------------------------------------------------------

/** A single concept node in the graph, matching the `/api/graph` node shape. */
export interface GraphNode {
  id: string;
  name: string;
  description: string;
  source_files: string[];
}

/** A directed relation between two concept nodes, matching the `/api/graph` edge shape. */
export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

/**
 * Global graph state: the full node/edge set plus room for later traversal
 * visualization (highlighted node/edge ids visited during a live query, and
 * the currently selected node for a detail overlay). Highlight/selection
 * fields are populated by later workers (graph3d/realtime-chat) — this round
 * only reads/writes the node/edge lists.
 */
export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightedNodeIds: string[];
  highlightedEdgeIds: string[];
  selectedNodeId: string | null;
  /**
   * True while a graph-generating operation (e.g. a genuine folder switch's
   * refetch) is in flight, so the UI can show a generating overlay. Cleared
   * by a later poll hook once the new graph is ready. Added for the
   * folder-selection rework.
   */
  generating: boolean;
}

export type GraphAction =
  | { type: "ADD_NODE"; node: GraphNode }
  | { type: "SET_GRAPH"; nodes: GraphNode[]; edges: GraphEdge[] }
  | { type: "RESET_GRAPH" }
  /**
   * Appends a node (and, when a prior step in the same trace establishes an
   * edge into it, that edge's highlight key too) to the live traversal
   * highlight trail. Additive -- does not replace the existing trail, so the
   * visited-path trail stays visible as the traversal progresses. Added for
   * Issue 10.
   */
  | { type: "HIGHLIGHT_NODE"; nodeId: string; edgeId?: string }
  /** Clears the live traversal highlight trail once a trace completes. Added for Issue 10. */
  | { type: "CLEAR_HIGHLIGHT" }
  /**
   * Appends newly-discovered edges (e.g. from useNodeFadeIn's poll-diff
   * against a newly-added node) without replacing the existing edge list.
   * Added for Issue 7.
   */
  | { type: "ADD_EDGES"; edges: GraphEdge[] }
  /**
   * Sets (or clears, with null) the node the HUD detail overlay is showing
   * detail for. Distinct from HIGHLIGHT_NODE/CLEAR_HIGHLIGHT (Issue 10's live
   * traversal trail): selection is a single explicit user click target, not
   * an accumulating multi-node trail. Added for Issue 8.
   */
  | { type: "SELECT_NODE"; nodeId: string | null }
  /**
   * Marks the graph as currently (re)generating, e.g. while a genuine folder
   * switch's new graph is being fetched. Added for the folder-selection rework.
   */
  | { type: "GENERATING_START" }
  /**
   * Clears the generating flag once the graph-generating operation completes.
   * Added for the folder-selection rework.
   */
  | { type: "GENERATING_END" };

// ---------------------------------------------------------------------------
// Chat slice
// ---------------------------------------------------------------------------

/** A message the user submitted. */
export interface UserMessage {
  kind: "user";
  id: string;
  text: string;
}

/** A final Haiku-summarized answer message. */
export interface AnswerMessage {
  kind: "answer";
  id: string;
  text: string;
}

/** A message shown when no relevant document was found for the query. */
export interface NoMatchMessage {
  kind: "no_match";
  id: string;
  message: string;
}

export type ChatMessage = UserMessage | AnswerMessage | NoMatchMessage;

/** One step of a live graph traversal, matching the WS `visit_node` event shape. */
export interface TraceStep {
  nodeId: string;
  concept: string;
  hop: number;
  viaRelation: string | null;
}

/**
 * The ordered traversal trace for a single query. `collapsed` flips to true
 * once the traversal completes, at which point the trace block summarizes
 * into a reasoning-path readout instead of the live step-by-step view.
 */
export interface Trace {
  queryId: string;
  steps: TraceStep[];
  collapsed: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  traces: Trace[];
  /**
   * The query id of the traversal currently in flight, or null when idle.
   * Optional so existing `ChatState` object literals (e.g. in reducer unit
   * tests) remain valid without listing it; treat a missing value as null.
   * Added for Issue 9 (Chat Query Submission) to enforce no-overlapping-queries.
   */
  activeQueryId?: string | null;
}

export type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "TRACE_STEP"; queryId: string; step: TraceStep }
  | { type: "TRACE_COMPLETE"; queryId: string }
  | { type: "RESET_SESSION" }
  /** Marks a newly submitted query as in flight. Added for Issue 9. */
  | { type: "QUERY_START"; queryId: string }
  /** Clears the in-flight query once an answer/no_match/error arrives. Added for Issue 9. */
  | { type: "QUERY_END" };

// ---------------------------------------------------------------------------
// Ingestion slice
// ---------------------------------------------------------------------------

/**
 * Ingestion status variants, matching the FolderStatusLine presentational
 * contract: idle (up to date), watching (queued file count), extracting
 * (current filename being processed).
 */
export type IngestionStatus =
  | { state: "idle" }
  | { state: "watching"; queued?: number }
  | { state: "extracting"; file?: string };

/** WebSocket connection lifecycle for the `/ws/chat` socket. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface IngestionState {
  folderPath: string | null;
  status: IngestionStatus;
  connectionStatus: ConnectionStatus;
}

export type IngestionAction =
  | { type: "STATUS_UPDATE"; status: IngestionStatus }
  | { type: "RESET_FOLDER"; folderPath: string }
  /** Reflects the `/ws/chat` connection lifecycle into ingestion state. Added for Issue 3. */
  | { type: "CONNECTION_STATUS"; status: ConnectionStatus };
