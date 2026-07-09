/**
 * Integration tests for useGeneratingStatus, which polls GET /api/ingest-status
 * while the graph slice's `generating` flag is set (set by a genuine folder
 * switch/upload) and dispatches GENERATING_END once the backend reports
 * ingestion has finished. Mirrors useIngestionStatus.test.tsx's fake-timers +
 * mocked-fetch + provider-wrapped probe harness, adapted to the
 * `/api/ingest-status` -> `{ingesting, path}` contract (Task 4/5 of the
 * folder-selection rework; docs/frontend/agent-briefs).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { resetAllMocks } from "../setup";
import { useGeneratingStatus } from "../../src/hooks/useGeneratingStatus";
import { useGraphState, AppProviders } from "../../src/state/providers";

afterEach(() => {
  resetAllMocks();
  cleanup();
});

/** Builds a stubbed GET /api/ingest-status response body. */
function ingestStatusResponse(ingesting: boolean) {
  return { status: 200, body: { ingesting, path: "/watched/folder" } };
}

/** Installs a mocked fetch that resolves /api/ingest-status with successive scripted responses. */
function mockIngestStatusSequence(bodies: Array<{ status: number; body: unknown }>): void {
  let call = 0;
  globalThis.fetch = vi.fn(() => {
    const match = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      json: () => Promise.resolve(match.body),
    } as Response);
  }) as typeof fetch;
}

/** Mounts useGeneratingStatus alongside a direct handle on graph state/dispatch. */
function renderGeneratingStatus() {
  return renderHook(
    () => {
      useGeneratingStatus();
      return useGraphState();
    },
    { wrapper: AppProviders }
  );
}

describe("useGeneratingStatus", () => {
  it("polls /api/ingest-status while generating and dispatches GENERATING_END once ingesting is false", async () => {
    /**
     * Given `generating` is true and fetch is mocked to return ingesting:true
     * twice then ingesting:false,
     * when three poll intervals elapse,
     * then `generating` flips to false after the third poll and no further
     * fetch calls occur afterward.
     */
    vi.useFakeTimers();
    mockIngestStatusSequence([
      ingestStatusResponse(true),
      ingestStatusResponse(true),
      ingestStatusResponse(false),
    ]);

    const { result } = renderGeneratingStatus();
    act(() => {
      result.current.dispatch({ type: "GENERATING_START" });
    });
    expect(result.current.state.generating).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.state.generating).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.state.generating).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.state.generating).toBe(false);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const callCountAtIdle = fetchMock.mock.calls.length;
    expect(callCountAtIdle).toBe(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(fetchMock.mock.calls.length).toBe(callCountAtIdle);
  });

  it("never fetches /api/ingest-status while generating is false", async () => {
    /**
     * Given `generating` is false (the initial state, never started),
     * when time elapses,
     * then the hook never calls fetch.
     */
    vi.useFakeTimers();
    mockIngestStatusSequence([ingestStatusResponse(false)]);

    const { result } = renderGeneratingStatus();
    expect(result.current.state.generating).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
