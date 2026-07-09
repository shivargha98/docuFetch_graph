/**
 * Integration tests for useIngestionStatus, which drives the folder panel's
 * live status indicator by polling GET /api/graph (the shipped backend has
 * no ingestion-event push channel -- see docs/frontend/frontend_context.md
 * decision D3).
 * Source: Feature: Live Ingestion Status Display (docs/frontend/features.md), Issue 5.
 *
 * DEVIATION FROM THE ORIGINAL STUB: this file's original stub imported
 * `mockWebSocket` and described a "mocked event stream" — that described the
 * planning docs' original (WebSocket-pushed) design, which the shipped
 * backend does not provide. Adapted mechanically to the polling design using
 * `mockFetch({graphRead: ...})` plus fake timers (`vi.useFakeTimers()` /
 * `vi.advanceTimersByTimeAsync()`) to simulate successive polls returning
 * growing node sets, in place of `emitMessage`. The three behaviors described
 * by the original stub are preserved: (1) status updates without a manual
 * refresh as polls return new data, (2) transitions reflect a
 * watching -> extracting -> idle-like sequence, indicating in-flight
 * activity, (3) status is retained across a collapse/re-expand of the
 * folder panel.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, renderHook, fireEvent } from "@testing-library/react";
import { mockFetch, resetAllMocks } from "../setup";
import { useIngestionStatus } from "../../src/hooks/useIngestionStatus";
import { useIngestionState, AppProviders } from "../../src/state/providers";
import { FolderDock } from "../../src/components/folder/FolderDock";

afterEach(() => {
  resetAllMocks();
  cleanup();
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

/** Mounts useIngestionStatus alongside a direct handle on ingestion state/dispatch. */
function renderIngestionStatus() {
  return renderHook(
    () => {
      useIngestionStatus();
      return useIngestionState();
    },
    { wrapper: AppProviders }
  );
}

describe("useIngestionStatus", () => {
  it("updates the displayed status without a manual refresh as polls return new data", async () => {
    /**
     * Given polling is active for a configured folder and fetch is mocked to
     * return successive GET /api/graph responses,
     * when each poll interval elapses,
     * then the displayed status updates to match each poll's derived state
     * without any manual refresh action.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 1
     */
    vi.useFakeTimers();
    mockFetch({ graphRead: graphResponse(["n1"]) });

    const { result } = renderIngestionStatus();
    act(() => {
      result.current.dispatch({ type: "RESET_FOLDER", folderPath: "/watched/folder" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.state.status).toEqual({ state: "watching" });

    mockFetch({ graphRead: graphResponse(["n1", "n2"]) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.state.status).toEqual({ state: "extracting" });
  });

  it("reflects both actively-watching/idle state and in-flight extraction progress", async () => {
    /**
     * Given a sequence of polls whose node counts are stable, then grow, then
     * stabilize again,
     * when each poll is processed,
     * then the status reflects each transition: watching (no activity yet),
     * extracting (growth observed), and idle (settled after activity).
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    vi.useFakeTimers();
    mockFetch({ graphRead: graphResponse(["n1"]) });

    const { result } = renderIngestionStatus();
    act(() => {
      result.current.dispatch({ type: "RESET_FOLDER", folderPath: "/watched/folder" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.state.status).toEqual({ state: "watching" });

    mockFetch({ graphRead: graphResponse(["n1", "n2"]) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.state.status).toEqual({ state: "extracting" });

    mockFetch({ graphRead: graphResponse(["n1", "n2"]) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.state.status).toEqual({ state: "idle" });
  });

  it("retains ingestion status when the folder dock is expanded and re-collapsed", async () => {
    /**
     * Given a current ingestion status is displayed in the real FolderDock's
     * bar,
     * when the dock is expanded and then collapsed again,
     * then the same status is shown throughout, not a reset/blank state --
     * because useIngestionStatus is mounted at the FolderDock level and the
     * bar (status included) is always rendered regardless of collapse.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 3
     */
    // Fake timers are installed before mount so the interval useIngestionStatus
    // creates on mount is itself a fake-clock interval (installing fake timers
    // after mount would leave an already-running real interval untouched by
    // vi.advanceTimersByTimeAsync). Collapse/expand is driven via fireEvent
    // (a plain synchronous click) rather than userEvent, since userEvent's
    // internal pointer-event sequencing hangs indefinitely under fake timers
    // in this environment even with `advanceTimers` configured.
    vi.useFakeTimers();
    mockFetch({
      folderConfig: { status: 200, body: { path: "/watched/folder" } },
      graphRead: graphResponse([]),
    });

    render(
      <AppProviders>
        <FolderDock />
      </AppProviders>
    );

    // Flush the mocked GET /api/folder-config prefill's microtask chain
    // (no real timer involved) so the active-source line reflects the loaded
    // folder (the panel shows its basename, with the full path as title).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("active-folder-name")).toHaveAttribute("title", "/watched/folder");

    mockFetch({
      folderConfig: { status: 200, body: { path: "/watched/folder" } },
      graphRead: graphResponse(["n1"]),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByTestId("folder-status-line")).toHaveTextContent(/watching/i);

    mockFetch({
      folderConfig: { status: 200, body: { path: "/watched/folder" } },
      graphRead: graphResponse(["n1", "n2"]),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByTestId("folder-status-line")).toHaveTextContent(/extracting/i);

    fireEvent.click(screen.getByRole("button", { name: /expand folder/i }));
    fireEvent.click(screen.getByRole("button", { name: /collapse folder/i }));

    expect(screen.getByTestId("folder-status-line")).toHaveTextContent(/extracting/i);
  });
});
