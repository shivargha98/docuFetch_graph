/**
 * Reducer for the ingestion slice of global app state: the watched folder
 * path, its ingestion status, and the WebSocket connection status. Pure and
 * independently unit-testable per the project's global-state design (Issue 2).
 */
import type { IngestionState, IngestionAction } from "./types";

/** The initial ingestion state: no folder configured yet, idle, disconnected. */
export const initialIngestionState: IngestionState = {
  folderPath: null,
  status: { state: "idle" },
  connectionStatus: "disconnected",
};

/**
 * Computes the next ingestion state for a given action without mutating the
 * previous state.
 * - STATUS_UPDATE replaces the current ingestion status.
 * - RESET_FOLDER sets the newly submitted folder path and resets status to idle.
 * - CONNECTION_STATUS replaces the current WebSocket connection status (Issue 3).
 */
export function ingestionReducer(state: IngestionState, action: IngestionAction): IngestionState {
  switch (action.type) {
    case "STATUS_UPDATE":
      return { ...state, status: action.status };
    case "RESET_FOLDER":
      return { ...state, folderPath: action.folderPath, status: { state: "idle" } };
    case "CONNECTION_STATUS":
      return { ...state, connectionStatus: action.status };
    default:
      return state;
  }
}
