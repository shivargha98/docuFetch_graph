/**
 * Shared Vitest setup for the docuFetch Graph frontend test suite.
 * Provides fixture helpers for mocking the network boundary (fetch + WebSocket)
 * and resetting shared browser state between tests. Individual test files import
 * from here rather than re-implementing mocks inline, so the mocked contract
 * shapes for the backend integration points live in exactly one place.
 *
 * Backend contracts are FINAL as of this round (docs/frontend/agent-briefs/worker-foundation-brief.md):
 * - GET /api/graph -> { nodes: [{id, name, description, source_files}], edges: [{source, target, relation}] }
 * - GET /api/folder-config -> { path }; POST -> 200 { path, status: "watching" } / 422 { detail }
 * - WS /ws/chat: send { query }; receive visit_node {node_id, concept, hop, via_relation},
 *   then traversal_complete {nodes_visited, hops_used}, then answer {text} / no_match {message};
 *   errors as error {message} without socket close.
 */

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const originalFetch = globalThis.fetch;
const originalWebSocket = (globalThis as typeof globalThis & { WebSocket?: unknown }).WebSocket;

/**
 * Resets any global/module-level mocks (fetch, WebSocket, timers) between tests.
 * Call from an `afterEach` in each test file, or rely on a global afterEach here.
 */
export function resetAllMocks(): void {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  (globalThis as typeof globalThis & { WebSocket?: unknown }).WebSocket = originalWebSocket;
}

/**
 * Installs a mocked `fetch` that resolves the docuFetch REST endpoints
 * (folder-configuration, graph-read) with caller-supplied responses.
 *
 * Routes by URL substring: any request whose URL contains `/api/folder-config`
 * resolves with `responses.folderConfig`, and `/api/graph` resolves with
 * `responses.graphRead`. A request to an unstubbed endpoint rejects.
 *
 * @param responses - map of endpoint key ("folderConfig" | "graphRead") to a
 *   mocked response body and status, used to stub the corresponding fetch call.
 */
export function mockFetch(responses: {
  folderConfig?: { status: number; body: unknown };
  graphRead?: { status: number; body: unknown };
}): void {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = url.includes("/api/folder-config")
      ? responses.folderConfig
      : url.includes("/api/graph")
        ? responses.graphRead
        : undefined;

    if (!match) {
      return Promise.reject(new Error(`mockFetch: no stubbed response for ${url}`));
    }

    return Promise.resolve({
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      json: () => Promise.resolve(match.body),
    } as Response);
  }) as typeof fetch;
}

/** A single fake WebSocket connection created while `mockWebSocket()` is installed. */
interface MockWebSocketInstance {
  url: string;
  sent: unknown[];
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: unknown): void;
  close(): void;
}

/** Handle returned by `mockWebSocket()` for driving and inspecting fake connections. */
export interface MockWebSocketHandle {
  emitOpen: () => void;
  emitMessage: (payload: unknown) => void;
  emitClose: (code?: number) => void;
  emitError: (err?: unknown) => void;
  /** Every fake WebSocket constructed while this mock is installed, in construction order. */
  instances: MockWebSocketInstance[];
}

/**
 * Installs a mocked WebSocket implementation and returns a handle for emitting
 * scripted events (connect, message, close, error) into any hook/component under
 * test that opens a WebSocket connection. Events are dispatched to the most
 * recently constructed instance. Each instance records every payload passed to
 * `send()` in its `sent` array, and all constructed instances are exposed via
 * the handle's `instances` array so tests can assert on what was sent.
 */
export function mockWebSocket(): MockWebSocketHandle {
  const instances: MockWebSocketInstance[] = [];

  class FakeWebSocket implements MockWebSocketInstance {
    url: string;
    sent: unknown[] = [];
    readyState = 0;
    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }

    send(data: unknown): void {
      this.sent.push(data);
    }

    close(): void {
      this.readyState = 3;
    }
  }

  (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = FakeWebSocket;

  const current = (): MockWebSocketInstance | undefined => instances[instances.length - 1];

  return {
    emitOpen: () => current()?.onopen?.(new Event("open")),
    emitMessage: (payload: unknown) =>
      current()?.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) })),
    emitClose: (code?: number) => current()?.onclose?.(new CloseEvent("close", { code })),
    emitError: (err?: unknown) => {
      const event = new Event("error") as Event & { error?: unknown };
      event.error = err;
      current()?.onerror?.(event);
    },
    instances,
  };
}

/**
 * Clears any persisted client-side state (e.g. last-selected folder, collapsed-panel
 * preference) between tests so component/hook tests start from a clean slate.
 */
export function resetLocalStorage(): void {
  localStorage.clear();
}
