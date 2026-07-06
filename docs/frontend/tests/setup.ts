/**
 * Shared Vitest setup for the docuFetch Graph frontend test suite.
 * Provides fixture helpers for mocking the network boundary (fetch + WebSocket)
 * and resetting shared browser state between tests. Individual test files import
 * from here rather than re-implementing mocks inline, so the mocked contract
 * shapes for the still-open backend integration points (WS schema/backend Issue 14,
 * folder-config shape/backend Issue 15, graph-read shape/backend Issue 16) live in
 * exactly one place and are easy to update once those backend issues land.
 *
 * NOTE: these are signatures/scaffolding only — not implemented yet.
 */

import "@testing-library/jest-dom";

/**
 * Resets any global/module-level mocks (fetch, WebSocket, timers) between tests.
 * Call from an `afterEach` in each test file, or rely on a global afterEach here.
 */
export function resetAllMocks(): void {
  throw new Error("Not implemented");
}

/**
 * Installs a mocked `fetch` that resolves the docuFetch REST endpoints
 * (folder-configuration, graph-read) with caller-supplied responses.
 *
 * The payload shapes accepted here are illustrative/provisional pending:
 * - folder-configuration endpoint shape -> backend Issue 15
 * - graph-read endpoint shape -> backend Issue 16
 *
 * @param responses - map of endpoint key ("folderConfig" | "graphRead") to a
 *   mocked response body and status, used to stub the corresponding fetch call.
 */
export function mockFetch(responses: {
  folderConfig?: { status: number; body: unknown };
  graphRead?: { status: number; body: unknown };
}): void {
  throw new Error("Not implemented");
}

/**
 * Installs a mocked WebSocket implementation and returns a handle for emitting
 * scripted events (connect, message, close, error) into any hook/component under
 * test that opens a WebSocket connection.
 *
 * The event payload shapes accepted here are illustrative/provisional pending
 * the full WS schema finalized against backend Issue 14 (traversal-step events,
 * completion events, answer/no-match events, ingestion-status events, error events).
 */
export function mockWebSocket(): {
  emitOpen: () => void;
  emitMessage: (payload: unknown) => void;
  emitClose: (code?: number) => void;
  emitError: (err?: unknown) => void;
} {
  throw new Error("Not implemented");
}

/**
 * Clears any persisted client-side state (e.g. last-selected folder, collapsed-panel
 * preference) between tests so component/hook tests start from a clean slate.
 */
export function resetLocalStorage(): void {
  throw new Error("Not implemented");
}
