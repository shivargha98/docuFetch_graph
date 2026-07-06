/**
 * Integration tests for the useWebSocket hook, which manages the WebSocket
 * connection lifecycle (connect, disconnect, auto-reconnect) used for chat
 * traversal streaming and, pending a channel decision, ingestion status.
 * Source: Feature: WebSocket Client & Connection Lifecycle (docs/frontend/features.md), Issue 3.
 *
 * Caveat: the mocked WebSocket handshake/event contract used throughout this file
 * is illustrative only, pending the full schema finalized against backend Issue 14.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useEffect } from "react";
import { mockWebSocket, resetAllMocks } from "../setup";
import { AppProviders, useIngestionState } from "../../src/state/providers";
import { useWebSocket } from "../../src/hooks/useWebSocket";

afterEach(() => {
  resetAllMocks();
  cleanup();
});

/**
 * Minimal harness that seeds ingestion state with a folder path (simulating
 * the folder worker's already-configured folder) and mounts useWebSocket,
 * rendering the resulting connectionStatus so tests can assert on it.
 */
function Harness({ seedFolder }: { seedFolder: string }) {
  const { state, dispatch } = useIngestionState();
  useWebSocket();

  useEffect(() => {
    dispatch({ type: "RESET_FOLDER", folderPath: seedFolder });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div data-testid="connection-status">{state.connectionStatus}</div>;
}

describe("useWebSocket", () => {
  it("establishes a connection on load when a folder is already configured and reflects a connected status", async () => {
    /**
     * Given a folder is already configured in ingestion state, and a mocked
     * WebSocket connects successfully,
     * when the hook mounts,
     * then a connection attempt is made and connection state updates to "connected".
     *
     * Source: Feature: WebSocket Client & Connection Lifecycle — criterion 1
     */
    const ws = mockWebSocket();
    render(
      <AppProviders>
        <Harness seedFolder="/docs" />
      </AppProviders>
    );

    expect(ws.instances.length).toBeGreaterThan(0);

    act(() => {
      ws.emitOpen();
    });

    expect(screen.getByTestId("connection-status").textContent).toBe("connected");
  });

  it("reflects a failed status when the initial connection attempt fails", () => {
    /**
     * Given a mocked WebSocket that immediately errors on connect,
     * when the hook mounts,
     * then connection state updates to "failed" rather than remaining "connecting" indefinitely.
     *
     * Source: Feature: WebSocket Client & Connection Lifecycle — criterion 1
     */
    const ws = mockWebSocket();
    render(
      <AppProviders>
        <Harness seedFolder="/docs" />
      </AppProviders>
    );

    act(() => {
      ws.emitError();
    });

    expect(screen.getByTestId("connection-status").textContent).toBe("error");
  });

  it("updates connection state to disconnected after an unexpected close event", () => {
    /**
     * Given an established mocked connection,
     * when a mocked unexpected close event fires,
     * then connection state updates to "disconnected" and is visibly indicated.
     *
     * Source: Feature: WebSocket Client & Connection Lifecycle — criterion 2
     */
    const ws = mockWebSocket();
    render(
      <AppProviders>
        <Harness seedFolder="/docs" />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    expect(screen.getByTestId("connection-status").textContent).toBe("connected");

    act(() => {
      ws.emitClose();
    });
    expect(screen.getByTestId("connection-status").textContent).toBe("disconnected");
  });

  it("automatically attempts to reconnect after an unexpected disconnect", () => {
    /**
     * Given a mocked connection that disconnects unexpectedly,
     * when time advances past the reconnect backoff interval,
     * then a new connection attempt is made without user action.
     *
     * Source: Feature: WebSocket Client & Connection Lifecycle — criterion 3
     */
    vi.useFakeTimers();
    const ws = mockWebSocket();
    render(
      <AppProviders>
        <Harness seedFolder="/docs" />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    const instancesAfterOpen = ws.instances.length;

    act(() => {
      ws.emitClose();
    });

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(ws.instances.length).toBeGreaterThan(instancesAfterOpen);
  });
});
