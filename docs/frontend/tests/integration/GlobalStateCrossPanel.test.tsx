/**
 * Integration tests for cross-panel consistency of the shared Context +
 * useReducer state (graph / chat / ingestion slices).
 * Source: Feature: Global App State (Graph / Chat / Ingestion Slices)
 * (docs/frontend/features.md), Issue 2.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mockWebSocket, resetAllMocks } from "../setup";

afterEach(() => {
  resetAllMocks();
});

describe("GlobalStateCrossPanel", () => {
  it("updates ingestion, graph, and chat state together when a folder switch is dispatched", () => {
    /**
     * Given all three panels are rendered and consuming shared Context state,
     * when a folder-switch action is dispatched,
     * then all three panels reflect the new folder's state — no panel still
     * shows the previous folder's data.
     *
     * Source: Feature: Global App State (Graph / Chat / Ingestion Slices) — criterion 1
     */
    throw new Error("Not implemented");
  });

  it("updates both the graph reducer and the chat reducer from a single traversal-step event stream", () => {
    /**
     * Given a single mocked traversal-step event stream,
     * when an event is processed,
     * then both the graph reducer's highlight state and the chat reducer's
     * trace state update from that same event.
     *
     * Source: Feature: Global App State (Graph / Chat / Ingestion Slices) — criterion 2
     */
    throw new Error("Not implemented");
  });
});
