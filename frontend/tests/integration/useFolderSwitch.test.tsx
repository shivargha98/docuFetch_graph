/**
 * Integration tests for useFolderSwitch, which tears down and resets graph,
 * chat, and ingestion state when the user submits a new folder path after one
 * is already loaded.
 * Source: Feature: Folder Switching & Session Reset (docs/frontend/features.md), Issue 14.
 *
 * `mockFetch` from tests/setup.ts routes every `/api/folder-config` request
 * (GET and POST alike) to the same stubbed response, so it can't express "GET
 * prefill succeeds, then POST submit succeeds with a different path" within
 * one test. These tests stub `fetch` locally with a queued sequence of
 * responses instead, matching the pattern already used by
 * tests/integration/useFolderConfig.test.tsx.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetAllMocks } from "../setup";
import { useFolderSwitch } from "../../src/hooks/useFolderSwitch";
import { useGraphState, useChatState, useIngestionState, AppProviders } from "../../src/state/providers";

afterEach(() => {
  resetAllMocks();
});

/** Builds a fake fetch Response resolving to the given status and JSON body. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** Queues the standard GET-prefill-then-POST-submit fetch sequence used by every test below. */
function stubFetchSequence() {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, { path: "/initial/folder" }))
    .mockResolvedValueOnce(jsonResponse(200, { path: "/new/folder", status: "watching" }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function renderFolderSwitch() {
  return renderHook(
    () => ({
      folderSwitch: useFolderSwitch(),
      graph: useGraphState(),
      chat: useChatState(),
      ingestion: useIngestionState(),
    }),
    { wrapper: AppProviders }
  );
}

describe("useFolderSwitch", () => {
  it("clears the currently displayed graph when a new valid folder path is submitted", async () => {
    /**
     * Given a folder is already loaded with a populated graph, and fetch is mocked
     * to accept a new folder path,
     * when a new valid folder path is submitted,
     * then graph state is cleared (zero nodes/edges) before the new folder's graph loads.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 1
     */
    stubFetchSequence();
    const { result } = renderFolderSwitch();
    await waitFor(() => expect(result.current.folderSwitch.defaultFolder).toBe("/initial/folder"));

    act(() => {
      result.current.graph.dispatch({
        type: "SET_GRAPH",
        nodes: [{ id: "n1", name: "Concept One", description: "", source_files: ["a.md"] }],
        edges: [],
      });
    });
    expect(result.current.graph.state.nodes).toHaveLength(1);

    await act(async () => {
      await result.current.folderSwitch.submit("/new/folder");
    });

    await waitFor(() => expect(result.current.graph.state.nodes).toHaveLength(0));
    expect(result.current.graph.state.edges).toHaveLength(0);
  });

  it("clears the chat transcript and starts a fresh session with no carried-over history", async () => {
    /**
     * Given an existing chat transcript with prior turns,
     * when a new valid folder path is submitted,
     * then the chat transcript is emptied with no prior turn history retained.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 2
     */
    stubFetchSequence();
    const { result } = renderFolderSwitch();
    await waitFor(() => expect(result.current.folderSwitch.defaultFolder).toBe("/initial/folder"));

    act(() => {
      result.current.chat.dispatch({
        type: "ADD_MESSAGE",
        message: { kind: "user", id: "m1", text: "What is X?" },
      });
    });
    expect(result.current.chat.state.messages).toHaveLength(1);

    await act(async () => {
      await result.current.folderSwitch.submit("/new/folder");
    });

    await waitFor(() => expect(result.current.chat.state.messages).toHaveLength(0));
    expect(result.current.chat.state.traces).toHaveLength(0);
  });

  it("resets ingestion status to reflect the newly submitted folder", async () => {
    /**
     * Given ingestion status showing progress for the previous folder,
     * when a new valid folder path is submitted,
     * then ingestion status resets rather than continuing to show the previous
     * folder's stale status.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 3
     */
    stubFetchSequence();
    const { result } = renderFolderSwitch();
    await waitFor(() => expect(result.current.folderSwitch.defaultFolder).toBe("/initial/folder"));

    act(() => {
      result.current.ingestion.dispatch({
        type: "STATUS_UPDATE",
        status: { state: "extracting", file: "stale.md" },
      });
    });
    expect(result.current.ingestion.state.status).toEqual({ state: "extracting", file: "stale.md" });

    await act(async () => {
      await result.current.folderSwitch.submit("/new/folder");
    });

    await waitFor(() => expect(result.current.ingestion.state.folderPath).toBe("/new/folder"));
    expect(result.current.ingestion.state.status).toEqual({ state: "watching" });
  });

  it("marks the graph as generating on a genuine folder switch", async () => {
    /**
     * Given a folder is already loaded, and fetch is mocked to accept a new
     * folder path,
     * when a new valid folder path is submitted (a genuine switch, not the
     * initial prefill),
     * then graph state's generating flag is set to true.
     *
     * Source: Task 4 — graph-state `generating` flag
     */
    stubFetchSequence();
    const { result } = renderFolderSwitch();
    await waitFor(() => expect(result.current.folderSwitch.defaultFolder).toBe("/initial/folder"));

    await act(async () => {
      await result.current.folderSwitch.submit("/new/folder");
    });

    await waitFor(() => expect(result.current.graph.state.generating).toBe(true));
  });

  it("does not mark the graph as generating on the initial prefill", async () => {
    /**
     * Given no folder is loaded yet,
     * when useFolderSwitch mounts and the initial GET prefill resolves
     * (null -> path, not a genuine switch),
     * then graph state's generating flag stays false.
     *
     * Source: Task 4 — graph-state `generating` flag
     */
    stubFetchSequence();
    const { result } = renderFolderSwitch();
    await waitFor(() => expect(result.current.folderSwitch.defaultFolder).toBe("/initial/folder"));

    expect(result.current.graph.state.generating).toBe(false);
  });
});
