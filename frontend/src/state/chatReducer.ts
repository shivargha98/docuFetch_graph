/**
 * Reducer for the chat slice of global app state: the message transcript and
 * the per-query live traversal trace. Pure and independently unit-testable
 * per the project's global-state design (Issue 2).
 */
import type { ChatState, ChatAction, Trace } from "./types";

/** The empty chat state used on initial load and after a RESET_SESSION action. */
export const initialChatState: ChatState = {
  messages: [],
  traces: [],
  activeQueryId: null,
};

/**
 * Computes the next chat state for a given action without mutating the
 * previous state.
 * - ADD_MESSAGE appends a message to the transcript.
 * - TRACE_STEP appends a visited-concept step to the named query's trace,
 *   creating a new in-progress trace if one doesn't exist yet.
 * - TRACE_COMPLETE marks the named query's trace as collapsed/summarized.
 * - RESET_SESSION clears the transcript and all traces.
 * - QUERY_START marks a newly submitted query as in flight (Issue 9).
 * - QUERY_END clears the in-flight query once it settles (Issue 9).
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "TRACE_STEP": {
      const existing = state.traces.find((trace) => trace.queryId === action.queryId);
      let traces: Trace[];
      if (existing) {
        traces = state.traces.map((trace) =>
          trace.queryId === action.queryId
            ? { ...trace, steps: [...trace.steps, action.step] }
            : trace
        );
      } else {
        traces = [
          ...state.traces,
          { queryId: action.queryId, steps: [action.step], collapsed: false },
        ];
      }
      return { ...state, traces };
    }
    case "TRACE_COMPLETE":
      return {
        ...state,
        traces: state.traces.map((trace) =>
          trace.queryId === action.queryId ? { ...trace, collapsed: true } : trace
        ),
      };
    case "RESET_SESSION":
      return { ...initialChatState };
    case "QUERY_START":
      return { ...state, activeQueryId: action.queryId };
    case "QUERY_END":
      return { ...state, activeQueryId: null };
    default:
      return state;
  }
}
