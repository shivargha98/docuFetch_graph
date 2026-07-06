/**
 * Integration tests for cross-panel consistency of the shared Context +
 * useReducer state (graph / chat / ingestion slices).
 * Source: Feature: Global App State (Graph / Chat / Ingestion Slices)
 * (docs/frontend/features.md), Issue 2.
 *
 * Two independent cases, assigned to a single shared file to avoid a
 * two-worker file conflict this round:
 * - Folder-switch consistency (Issue 14 territory): exercises only
 *   already-existing reducer actions (RESET_GRAPH, RESET_SESSION,
 *   RESET_FOLDER) across all three panels' Context state -- no new
 *   production code required.
 * - A single traversal-step event stream updating both the graph reducer's
 *   highlight state and the chat reducer's trace state (Issue 10), via
 *   useTraversalSync.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { mockWebSocket, resetAllMocks } from "../setup";
import {
  AppProviders,
  useIngestionState,
  useGraphState,
  useChatState,
} from "../../src/state/providers";
import { useTraversalSync } from "../../src/hooks/useTraversalSync";
import type { GraphAction, ChatAction, IngestionAction } from "../../src/state/types";

afterEach(() => {
  resetAllMocks();
  cleanup();
});

interface Api {
  ingestionDispatch: (action: IngestionAction) => void;
  graphDispatch: (action: GraphAction) => void;
  chatDispatch: (action: ChatAction) => void;
}

/** Renders a stand-in for the folder panel, reading only ingestion state. */
function FolderPanelProbe() {
  const { state } = useIngestionState();
  return <div data-testid="folder-panel-probe">{`${state.folderPath ?? "none"}:${state.status.state}`}</div>;
}

/** Renders a stand-in for the graph panel, reading only graph state. */
function GraphPanelProbe() {
  const { state } = useGraphState();
  return <div data-testid="graph-panel-probe">{`${state.nodes.length}:${state.highlightedNodeIds.join(",")}`}</div>;
}

/** Renders a stand-in for the chat panel, reading chat state and mounting useTraversalSync (as ChatTranscript does in the real app). */
function ChatPanelProbe() {
  useTraversalSync();
  const { state } = useChatState();
  return <div data-testid="chat-panel-probe">{`${state.messages.length}:${state.traces.length}`}</div>;
}

/** Exposes each slice's dispatch via a ref so the test can drive actions directly. */
function Controls({ apiRef }: { apiRef: { current: Api | null } }) {
  const { dispatch: ingestionDispatch } = useIngestionState();
  const { dispatch: graphDispatch } = useGraphState();
  const { dispatch: chatDispatch } = useChatState();
  apiRef.current = { ingestionDispatch, graphDispatch, chatDispatch };
  return null;
}

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
    mockWebSocket();
    const apiRef: { current: Api | null } = { current: null };
    render(
      <AppProviders>
        <FolderPanelProbe />
        <GraphPanelProbe />
        <ChatPanelProbe />
        <Controls apiRef={apiRef} />
      </AppProviders>
    );

    // Seed some "previous folder" state across all three slices.
    act(() => {
      apiRef.current!.ingestionDispatch({ type: "RESET_FOLDER", folderPath: "/old-notes" });
      apiRef.current!.graphDispatch({
        type: "SET_GRAPH",
        nodes: [{ id: "n1", name: "Old", description: "", source_files: [] }],
        edges: [],
      });
      apiRef.current!.chatDispatch({ type: "ADD_MESSAGE", message: { kind: "user", id: "m1", text: "old question" } });
    });

    expect(screen.getByTestId("folder-panel-probe").textContent).toBe("/old-notes:idle");
    expect(screen.getByTestId("graph-panel-probe").textContent).toBe("1:");
    expect(screen.getByTestId("chat-panel-probe").textContent).toBe("1:0");

    // Dispatch a folder switch: all three slices reset/reflect the new folder.
    act(() => {
      apiRef.current!.ingestionDispatch({ type: "RESET_FOLDER", folderPath: "/new-notes" });
      apiRef.current!.graphDispatch({ type: "RESET_GRAPH" });
      apiRef.current!.chatDispatch({ type: "RESET_SESSION" });
    });

    expect(screen.getByTestId("folder-panel-probe").textContent).toBe("/new-notes:idle");
    expect(screen.getByTestId("graph-panel-probe").textContent).toBe("0:");
    expect(screen.getByTestId("chat-panel-probe").textContent).toBe("0:0");
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
    mockWebSocket();
    const apiRef: { current: Api | null } = { current: null };
    render(
      <AppProviders>
        <FolderPanelProbe />
        <GraphPanelProbe />
        <ChatPanelProbe />
        <Controls apiRef={apiRef} />
      </AppProviders>
    );

    act(() => {
      apiRef.current!.chatDispatch({
        type: "TRACE_STEP",
        queryId: "q1",
        step: { nodeId: "n7", concept: "Epsilon", hop: 0, viaRelation: null },
      });
    });

    expect(screen.getByTestId("chat-panel-probe").textContent).toBe("0:1");
    expect(screen.getByTestId("graph-panel-probe").textContent).toBe("0:n7");
  });
});
