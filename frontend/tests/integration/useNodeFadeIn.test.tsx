/**
 * Integration tests for useNodeFadeIn, which animates newly discovered concept
 * nodes into the already-rendered 3D scene as ingestion adds them.
 * Source: Feature: Live Node Fade-In on Ingestion (docs/frontend/features.md), Issue 7.
 *
 * DEVIATION FROM THE ORIGINAL STUB: this file's original stub imported
 * `mockWebSocket` and described a "mocked ingestion event" -- that described
 * the planning docs' original (WebSocket-pushed) design, which the shipped
 * backend does not provide (see docs/frontend/frontend_context.md decision
 * D3, and Round 3's identical deviation documented in
 * useIngestionStatus.test.tsx). Adapted mechanically to the polling design
 * using `mockFetch({graphRead: ...})` plus fake timers
 * (`vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync()`) in place of
 * `emitMessage`. The two behaviors described by the original stub are
 * preserved: (1) a newly-added node is tracked in a fade window (asserted via
 * the returned fade-map ref, since the actual scale/pop-in animation itself
 * lives in GraphView.tsx's three.js render loop -- see that file's
 * `handleNodePositionUpdate` -- and can't be observed without a real WebGL
 * render, which no headless-browser tool in this sandbox can provide), and
 * (2) existing nodes are left completely undisturbed (same array entries,
 * not replaced) when a new node fades in.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { mockFetch, resetAllMocks } from "../setup";
import { useNodeFadeIn, FADE_DURATION_MS } from "../../src/hooks/useNodeFadeIn";
import { useGraphState, useIngestionState, AppProviders } from "../../src/state/providers";

afterEach(() => {
  resetAllMocks();
});

/** Builds a stubbed GET /api/graph response body containing the given node ids. */
function graphResponse(nodeIds: string[]) {
  return {
    status: 200,
    body: {
      nodes: nodeIds.map((id) => ({ id, name: id, description: "", source_files: [] })),
      edges: [],
    },
  };
}

/** Mounts useNodeFadeIn alongside direct handles on graph/ingestion state and dispatch. */
function renderNodeFadeIn() {
  return renderHook(
    () => {
      const fadeMapRef = useNodeFadeIn();
      const { state: graphState, dispatch: graphDispatch } = useGraphState();
      const { dispatch: ingestionDispatch } = useIngestionState();
      return { fadeMapRef, graphState, graphDispatch, ingestionDispatch };
    },
    { wrapper: AppProviders }
  );
}

describe("useNodeFadeIn", () => {
  it("animates a newly-added node fading into the scene when a mocked ingestion event announces it", async () => {
    /**
     * Given an already-rendered scene with existing nodes, and a mocked event
     * announcing a new node,
     * when the event is processed,
     * then the new node appears via a fade/pop-in transition rather than
     * appearing abruptly.
     *
     * Source: Feature: Live Node Fade-In on Ingestion — criterion 1
     */
    vi.useFakeTimers();
    mockFetch({ graphRead: graphResponse(["n1"]) });

    const { result } = renderNodeFadeIn();
    act(() => {
      result.current.ingestionDispatch({ type: "RESET_FOLDER", folderPath: "/watched/folder" });
    });

    mockFetch({ graphRead: graphResponse(["n1", "n2"]) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(result.current.graphState.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    // n2 is genuinely new this poll, so it's within its fade window.
    expect(result.current.fadeMapRef.current.has("n2")).toBe(true);

    // Once the fade duration elapses, the node settles and is no longer tracked.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FADE_DURATION_MS + 50);
    });
    expect(result.current.fadeMapRef.current.has("n2")).toBe(false);
  });

  it("does not re-layout or disturb existing nodes when a new node fades in", async () => {
    /**
     * Given an already-rendered scene with existing nodes at known positions,
     * when a new node fade-in event is processed,
     * then existing nodes' positions are unchanged immediately after the new
     * node appears.
     *
     * Source: Feature: Live Node Fade-In on Ingestion — criterion 2
     */
    vi.useFakeTimers();
    mockFetch({ graphRead: graphResponse(["n1"]) });

    const { result } = renderNodeFadeIn();
    act(() => {
      result.current.ingestionDispatch({ type: "RESET_FOLDER", folderPath: "/watched/folder" });
      result.current.graphDispatch({
        type: "SET_GRAPH",
        nodes: [{ id: "n1", name: "n1", description: "", source_files: [] }],
        edges: [],
      });
    });
    const originalN1 = result.current.graphState.nodes[0];

    mockFetch({ graphRead: graphResponse(["n1", "n2"]) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    // ADD_NODE only appends -- the pre-existing node's object identity (and
    // therefore any x/y/z the force simulation has already assigned it) is
    // untouched, unlike a full SET_GRAPH replace which would recreate the array.
    expect(result.current.graphState.nodes[0]).toBe(originalN1);
    expect(result.current.graphState.nodes).toHaveLength(2);
  });
});
