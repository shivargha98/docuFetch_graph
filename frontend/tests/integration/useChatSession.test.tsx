/**
 * Integration tests for useChatSession, which handles submitting a chat
 * question over the WebSocket connection and appending it to the transcript.
 * Source: Feature: Chat Query Submission (docs/frontend/features.md), Issue 9.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { mockWebSocket, resetAllMocks } from "../setup";
import { AppProviders, useIngestionState } from "../../src/state/providers";
import { useChatSession, type UseChatSessionResult } from "../../src/hooks/useChatSession";

afterEach(() => {
  resetAllMocks();
  cleanup();
});

/**
 * Minimal harness that seeds a configured folder (so useWebSocket connects),
 * mounts useChatSession, exposes its API via a ref for the test to drive
 * directly, and renders the transcript/in-flight flag for assertions.
 */
function Harness({ apiRef }: { apiRef: { current: UseChatSessionResult | null } }) {
  const { dispatch: ingestionDispatch } = useIngestionState();
  const session = useChatSession();
  apiRef.current = session;

  useEffect(() => {
    ingestionDispatch({ type: "RESET_FOLDER", folderPath: "/docs" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const last = session.messages[session.messages.length - 1];
  const lastText = last ? ("text" in last ? last.text : last.message) : "";

  return (
    <div>
      <div data-testid="message-count">{session.messages.length}</div>
      <div data-testid="last-message">{lastText}</div>
      <div data-testid="in-progress">{String(session.queryInProgress)}</div>
    </div>
  );
}

describe("useChatSession", () => {
  it("sends a submitted question over the active WebSocket connection and appends it to the transcript", () => {
    /**
     * Given an active mocked WebSocket connection,
     * when a non-empty question is submitted,
     * then the question is sent over the connection and appears as a new entry
     * in the visible transcript.
     *
     * Source: Feature: Chat Query Submission — criterion 1
     */
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <Harness apiRef={apiRef} />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });

    act(() => {
      apiRef.current!.submit("What is docuFetch?");
    });

    const lastInstance = ws.instances[ws.instances.length - 1];
    expect(lastInstance.sent).toEqual([JSON.stringify({ query: "What is docuFetch?" })]);
    expect(screen.getByTestId("message-count").textContent).toBe("1");
    expect(screen.getByTestId("last-message").textContent).toBe("What is docuFetch?");
  });

  it("disables the chat input while a traversal is already in progress", () => {
    /**
     * Given a submitted question with traversal still in progress (no completion
     * event yet),
     * when the user attempts to submit a second question,
     * then the input is disabled or the second submission is queued rather than
     * sent immediately.
     *
     * Source: Feature: Chat Query Submission — criterion 2
     */
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <Harness apiRef={apiRef} />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    act(() => {
      apiRef.current!.submit("First question");
    });

    expect(screen.getByTestId("in-progress").textContent).toBe("true");

    act(() => {
      apiRef.current!.submit("Second question");
    });

    const lastInstance = ws.instances[ws.instances.length - 1];
    expect(lastInstance.sent).toHaveLength(1);
    expect(screen.getByTestId("message-count").textContent).toBe("1");
  });

  it("does not send or append anything when the submitted question is empty", () => {
    /**
     * Given an empty input value,
     * when submission is triggered,
     * then no message is sent over the connection and no new transcript entry is added.
     *
     * Source: Feature: Chat Query Submission — criterion 3
     */
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <Harness apiRef={apiRef} />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    act(() => {
      apiRef.current!.submit("   ");
    });

    const lastInstance = ws.instances[ws.instances.length - 1];
    expect(lastInstance.sent).toHaveLength(0);
    expect(screen.getByTestId("message-count").textContent).toBe("0");
  });
});
