/**
 * Unit tests for the graph, chat, and ingestion reducers that back the app's
 * global state (React Context + useReducer, one reducer per concern).
 * Source: Feature: Global App State (Graph / Chat / Ingestion Slices);
 * Feature: Folder Switching & Session Reset; Feature: Live Traversal Trace Block;
 * Feature: Chat Query Submission; Feature: Live Ingestion Status Display.
 */
import { describe, it, expect } from "vitest";
import { graphReducer } from "../../src/state/graphReducer";
import { chatReducer } from "../../src/state/chatReducer";
import { ingestionReducer } from "../../src/state/ingestionReducer";
import type { GraphState, ChatState, IngestionState } from "../../src/state/types";

describe("graphReducer", () => {
  it("adds a node without mutating the previous state", () => {
    /**
     * Given an existing graph state with N nodes,
     * when an ADD_NODE action is dispatched,
     * then the returned state contains N+1 nodes and the original state object
     * passed in is left unmodified.
     *
     * Source: Feature: Global App State (Graph / Chat / Ingestion Slices)
     */
    const previous: GraphState = {
      nodes: [{ id: "n1", name: "Alpha", description: "", source_files: [] }],
      edges: [],
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      selectedNodeId: null,
    };
    const next = graphReducer(previous, {
      type: "ADD_NODE",
      node: { id: "n2", name: "Beta", description: "", source_files: [] },
    });

    expect(next.nodes).toHaveLength(2);
    expect(previous.nodes).toHaveLength(1);
  });

  it("clears all nodes/edges on a RESET_GRAPH action", () => {
    /**
     * Given an existing graph state with nodes and edges,
     * when a RESET_GRAPH action is dispatched,
     * then the returned state has zero nodes and zero edges.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 1
     */
    const previous: GraphState = {
      nodes: [{ id: "n1", name: "Alpha", description: "", source_files: [] }],
      edges: [{ source: "n1", target: "n2", relation: "relates_to" }],
      highlightedNodeIds: ["n1"],
      highlightedEdgeIds: [],
      selectedNodeId: "n1",
    };
    const next = graphReducer(previous, { type: "RESET_GRAPH" });

    expect(next.nodes).toHaveLength(0);
    expect(next.edges).toHaveLength(0);
  });
});

describe("chatReducer", () => {
  it("appends a new message to the transcript", () => {
    /**
     * Given an existing chat state with an existing transcript,
     * when an ADD_MESSAGE action is dispatched,
     * then the returned state's transcript includes the new message appended at the end.
     *
     * Source: Feature: Chat Query Submission — criterion 1
     */
    const previous: ChatState = {
      messages: [{ kind: "user", id: "m1", text: "What is docuFetch?" }],
      traces: [],
    };
    const next = chatReducer(previous, {
      type: "ADD_MESSAGE",
      message: { kind: "answer", id: "m2", text: "It's a personal LLM wiki." },
    });

    expect(next.messages).toHaveLength(2);
    expect(next.messages[1]).toEqual({ kind: "answer", id: "m2", text: "It's a personal LLM wiki." });
  });

  it("appends a trace step to the in-progress trace", () => {
    /**
     * Given a chat state with an in-progress (uncollapsed) trace,
     * when a TRACE_STEP action is dispatched with a newly visited concept,
     * then the returned state's trace sequence includes the new concept appended in order.
     *
     * Source: Feature: Live Traversal Trace Block — criterion 1
     */
    const previous: ChatState = {
      messages: [],
      traces: [
        {
          queryId: "q1",
          collapsed: false,
          steps: [{ nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null }],
        },
      ],
    };
    const next = chatReducer(previous, {
      type: "TRACE_STEP",
      queryId: "q1",
      step: { nodeId: "n2", concept: "Beta", hop: 1, viaRelation: "relates_to" },
    });

    expect(next.traces[0].steps).toHaveLength(2);
    expect(next.traces[0].steps[1].concept).toBe("Beta");
  });

  it("collapses the trace into a reasoning-path summary on a TRACE_COMPLETE action", () => {
    /**
     * Given a chat state with an in-progress trace and no answer yet,
     * when a TRACE_COMPLETE action is dispatched,
     * then the returned state marks that query's trace as collapsed/summarized.
     *
     * Source: Feature: Live Traversal Trace Block — criterion 2
     */
    const previous: ChatState = {
      messages: [],
      traces: [
        {
          queryId: "q1",
          collapsed: false,
          steps: [{ nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null }],
        },
      ],
    };
    const next = chatReducer(previous, { type: "TRACE_COMPLETE", queryId: "q1" });

    expect(next.traces[0].collapsed).toBe(true);
  });

  it("clears the transcript on a RESET_SESSION action", () => {
    /**
     * Given a chat state with prior transcript history,
     * when a RESET_SESSION action is dispatched,
     * then the returned state's transcript is empty.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 2
     */
    const previous: ChatState = {
      messages: [{ kind: "user", id: "m1", text: "Hi" }],
      traces: [{ queryId: "q1", collapsed: true, steps: [] }],
    };
    const next = chatReducer(previous, { type: "RESET_SESSION" });

    expect(next.messages).toHaveLength(0);
  });
});

describe("ingestionReducer", () => {
  it("updates status text on a STATUS_UPDATE action", () => {
    /**
     * Given an ingestion state with a prior status value,
     * when a STATUS_UPDATE action is dispatched with a new status,
     * then the returned state reflects the new status value.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    const previous: IngestionState = {
      folderPath: "/home/user/notes",
      status: { state: "idle" },
      connectionStatus: "connected",
    };
    const next = ingestionReducer(previous, {
      type: "STATUS_UPDATE",
      status: { state: "extracting", file: "notes.md" },
    });

    expect(next.status).toEqual({ state: "extracting", file: "notes.md" });
  });

  it("resets to idle on a RESET_FOLDER action", () => {
    /**
     * Given an ingestion state mid-extraction,
     * when a RESET_FOLDER action is dispatched,
     * then the returned state reflects an idle/reset status for the newly submitted folder.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 3
     */
    const previous: IngestionState = {
      folderPath: "/home/user/old-notes",
      status: { state: "extracting", file: "draft.md" },
      connectionStatus: "connected",
    };
    const next = ingestionReducer(previous, {
      type: "RESET_FOLDER",
      folderPath: "/home/user/new-notes",
    });

    expect(next.status).toEqual({ state: "idle" });
    expect(next.folderPath).toBe("/home/user/new-notes");
  });
});
