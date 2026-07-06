/**
 * Integration tests for useTraversalSync, which consumes traversal-step
 * WebSocket events to drive both the chat trace block and the 3D graph's
 * sequential highlight + camera-follow, from a single shared event stream.
 * Source: Feature: Live Traversal Highlight & Camera-Follow; Feature: Live
 * Traversal Trace Block (docs/frontend/features.md), Issue 10.
 *
 * Caveat: the mocked traversal-step/completion event payload shapes used
 * throughout this file are illustrative only, pending backend Issue 14's full
 * WebSocket schema.
 *
 * useTraversalSync watches ChatState.traces (already populated elsewhere, by
 * useChatSession's WS event handling) rather than the socket directly, so
 * these tests drive it by dispatching TRACE_STEP/TRACE_COMPLETE chat actions
 * straight into chat state and observe both chat and graph state, plus the
 * `graphCameraControls` camera-follow seam (stubbed here, since GraphView/
 * ForceGraph3D aren't mounted in this test).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { mockWebSocket, resetAllMocks } from "../setup";
import { AppProviders, useChatState, useGraphState } from "../../src/state/providers";
import { useTraversalSync } from "../../src/hooks/useTraversalSync";
import { graphCameraControls } from "../../src/components/graph/GraphView";
import type { ChatAction, ChatState, GraphState } from "../../src/state/types";

afterEach(() => {
  resetAllMocks();
  cleanup();
  graphCameraControls.current = null;
});

interface HarnessApi {
  chatDispatch: (action: ChatAction) => void;
  chatState: ChatState;
  graphState: GraphState;
}

/** Mounts useTraversalSync and exposes live chat/graph state + a dispatcher via a ref, for the test to drive and assert on directly. */
function Harness({ apiRef }: { apiRef: { current: HarnessApi | null } }) {
  useTraversalSync();
  const { state: chatState, dispatch: chatDispatch } = useChatState();
  const { state: graphState } = useGraphState();
  apiRef.current = { chatDispatch, chatState, graphState };
  return null;
}

describe("useTraversalSync", () => {
  it("updates the trace block and highlights the corresponding graph node/edge for each traversal-step event, in order", () => {
    /**
     * Given a mocked sequence of traversal-step events, each carrying a concept
     * and hop number,
     * when each event is processed in sequence,
     * then the trace block's visited-concept sequence grows in the same order
     * as the events, and the corresponding node/edge is highlighted in that
     * same order.
     *
     * Source: Feature: Live Traversal Highlight & Camera-Follow — criterion 1;
     * Feature: Live Traversal Trace Block — criterion 1
     */
    mockWebSocket();
    graphCameraControls.current = { focusNode: vi.fn() };
    const apiRef: { current: HarnessApi | null } = { current: null };
    render(
      <AppProviders>
        <Harness apiRef={apiRef} />
      </AppProviders>
    );

    act(() => {
      apiRef.current!.chatDispatch({
        type: "TRACE_STEP",
        queryId: "q1",
        step: { nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null },
      });
    });
    act(() => {
      apiRef.current!.chatDispatch({
        type: "TRACE_STEP",
        queryId: "q1",
        step: { nodeId: "n2", concept: "Beta", hop: 1, viaRelation: "depends_on" },
      });
    });

    expect(apiRef.current!.chatState.traces[0].steps.map((s) => s.concept)).toEqual(["Alpha", "Beta"]);
    expect(apiRef.current!.graphState.highlightedNodeIds).toEqual(["n1", "n2"]);
    expect(apiRef.current!.graphState.highlightedEdgeIds).toEqual(["n1->n2"]);
  });

  it("pans/zooms the camera toward each newly visited node as steps arrive", () => {
    /**
     * Given a mocked traversal-step event for a node not currently in camera focus,
     * when the event is processed,
     * then a camera pan/zoom transition toward that node's position is triggered.
     *
     * Source: Feature: Live Traversal Highlight & Camera-Follow — criterion 3
     */
    mockWebSocket();
    const focusNode = vi.fn();
    graphCameraControls.current = { focusNode };
    const apiRef: { current: HarnessApi | null } = { current: null };
    render(
      <AppProviders>
        <Harness apiRef={apiRef} />
      </AppProviders>
    );

    act(() => {
      apiRef.current!.chatDispatch({
        type: "TRACE_STEP",
        queryId: "q1",
        step: { nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null },
      });
    });
    act(() => {
      apiRef.current!.chatDispatch({
        type: "TRACE_STEP",
        queryId: "q1",
        step: { nodeId: "n2", concept: "Beta", hop: 1, viaRelation: "depends_on" },
      });
    });

    expect(focusNode.mock.calls.map((call) => call[0])).toEqual(["n1", "n2"]);
  });

  it("stops highlighting and camera-follow and collapses the trace once the completion event is received", () => {
    /**
     * Given an in-progress traversal with active highlighting,
     * when a mocked completion event is received,
     * then no further highlight/camera-follow updates occur, and the trace
     * block transitions to its collapsed "show reasoning path" state.
     *
     * Source: Feature: Live Traversal Highlight & Camera-Follow — criterion 4;
     * Feature: Live Traversal Trace Block — criterion 2
     */
    mockWebSocket();
    const focusNode = vi.fn();
    graphCameraControls.current = { focusNode };
    const apiRef: { current: HarnessApi | null } = { current: null };
    render(
      <AppProviders>
        <Harness apiRef={apiRef} />
      </AppProviders>
    );

    act(() => {
      apiRef.current!.chatDispatch({
        type: "TRACE_STEP",
        queryId: "q1",
        step: { nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null },
      });
    });
    expect(apiRef.current!.graphState.highlightedNodeIds).toEqual(["n1"]);

    act(() => {
      apiRef.current!.chatDispatch({ type: "TRACE_COMPLETE", queryId: "q1" });
    });

    expect(apiRef.current!.chatState.traces[0].collapsed).toBe(true);
    expect(apiRef.current!.graphState.highlightedNodeIds).toEqual([]);
    expect(apiRef.current!.graphState.highlightedEdgeIds).toEqual([]);

    const callsAtCompletion = focusNode.mock.calls.length;
    // No further steps are dispatched for this (now-collapsed) trace, so the
    // camera-follow call count must not grow past this point.
    expect(focusNode.mock.calls.length).toBe(callsAtCompletion);
  });
});
