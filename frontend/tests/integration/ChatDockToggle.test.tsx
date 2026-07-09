/**
 * Integration tests for ChatDock, the LinkedIn-style bottom-docked chat that
 * replaced the fixed right chat panel: a persistent bottom-right bar that
 * expands into a chat window on click and collapses on the next click.
 * Verifies the dock starts collapsed, the transcript/scroll position/live
 * traversal all survive a collapse cycle, and the WebSocket is created once
 * and never re-created by toggling (the body is CSS-hidden, not unmounted).
 * Source: docs/superpowers/specs/2026-07-09-chat-dock-design.md.
 *
 * jsdom has no real layout/CSS engine, so "hidden while collapsed" is
 * asserted via the class that encodes it, matching the suite's convention.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { mockWebSocket, resetAllMocks } from "../setup";
import { AppProviders, useIngestionState, useChatState } from "../../src/state/providers";
import { ChatDock } from "../../src/components/chat/ChatDock";
import { useChatSession, type UseChatSessionResult } from "../../src/hooks/useChatSession";

afterEach(() => {
  resetAllMocks();
  cleanup();
});

/** Seeds a configured folder (so the chat socket connects) and exposes the chat session API via a ref. */
function SessionHarness({ apiRef }: { apiRef: { current: UseChatSessionResult | null } }) {
  const { dispatch: ingestionDispatch } = useIngestionState();
  const session = useChatSession();
  apiRef.current = session;

  useEffect(() => {
    ingestionDispatch({ type: "RESET_FOLDER", folderPath: "/docs" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Reads the live trace step count for the first query directly from context, independent of the dock's collapse state. */
function TraceProbe() {
  const { state } = useChatState();
  const trace = state.traces[0];
  return <div data-testid="trace-step-count">{trace ? trace.steps.length : 0}</div>;
}

describe("ChatDockToggle", () => {
  it("starts collapsed and expands/collapses when the bar is pressed", async () => {
    /**
     * Given the dock is rendered,
     * then only the bar shows (body hidden) with the connection chip visible;
     * pressing the bar reveals the chat window; pressing again hides it —
     * hidden via CSS, never unmounted.
     */
    const user = userEvent.setup();
    mockWebSocket();
    render(
      <AppProviders>
        <ChatDock />
      </AppProviders>
    );

    const body = screen.getByTestId("chat-dock-body");
    expect(body.className).toContain("hidden");
    expect(screen.getByTestId("connection-status-chip")).toBeInTheDocument();

    const toggle = screen.getByTestId("chat-dock-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("chat-dock-body").className).not.toContain("hidden");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Still mounted — just hidden.
    expect(screen.getByTestId("chat-dock-body").className).toContain("hidden");
  });

  it("keeps the transcript and its scroll position across a collapse/expand cycle without re-creating the socket", async () => {
    /**
     * Given an expanded dock with transcript history and a scroll position,
     * when it is collapsed and re-expanded,
     * then the same transcript and scrollTop are shown and no second
     * WebSocket was constructed.
     */
    const user = userEvent.setup();
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <SessionHarness apiRef={apiRef} />
        <ChatDock />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    act(() => {
      apiRef.current!.submit("What is docuFetch?");
    });

    const socketsBefore = ws.instances.length;

    await user.click(screen.getByTestId("chat-dock-toggle"));
    expect(screen.getByText("What is docuFetch?")).toBeInTheDocument();

    const transcript = screen.getByTestId("chat-transcript");
    transcript.scrollTop = 42;

    await user.click(screen.getByTestId("chat-dock-toggle"));
    await user.click(screen.getByTestId("chat-dock-toggle"));

    expect(screen.getByText("What is docuFetch?")).toBeInTheDocument();
    expect(screen.getByTestId("chat-transcript").scrollTop).toBe(42);
    expect(ws.instances.length).toBe(socketsBefore);
  });

  it("shows an unread badge on the collapsed bar when an answer arrives, cleared on expand", async () => {
    /**
     * Given a query answered while the dock is collapsed,
     * then the bar shows an unread badge with the count and the dock stays
     * closed (no auto-open — LinkedIn-true behavior per the design Q&A);
     * when the bar is pressed,
     * then the dock opens with the answer and the badge clears.
     */
    const user = userEvent.setup();
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <SessionHarness apiRef={apiRef} />
        <ChatDock />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    act(() => {
      apiRef.current!.submit("What is docuFetch?");
    });

    expect(screen.queryByTestId("chat-unread-badge")).not.toBeInTheDocument();

    act(() => {
      ws.emitMessage({ type: "answer", text: "A personal LLM wiki." });
    });

    // Stays collapsed; badge counts the unseen answer.
    expect(screen.getByTestId("chat-dock-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("chat-unread-badge").textContent).toBe("1");

    await user.click(screen.getByTestId("chat-dock-toggle"));

    expect(screen.getByText("A personal LLM wiki.")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-unread-badge")).not.toBeInTheDocument();
  });

  it("never shows the unread badge for answers that arrive while the dock is open", async () => {
    /**
     * Given the dock is expanded when an answer arrives,
     * then no unread badge appears (the answer was seen live), and none
     * appears after a later collapse either.
     */
    const user = userEvent.setup();
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <SessionHarness apiRef={apiRef} />
        <ChatDock />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    await user.click(screen.getByTestId("chat-dock-toggle"));
    act(() => {
      apiRef.current!.submit("What is docuFetch?");
    });
    act(() => {
      ws.emitMessage({ type: "answer", text: "A personal LLM wiki." });
    });

    expect(screen.queryByTestId("chat-unread-badge")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("chat-dock-toggle"));
    expect(screen.queryByTestId("chat-unread-badge")).not.toBeInTheDocument();
  });

  it("continues updating an in-progress traversal while the dock is collapsed", async () => {
    /**
     * Given a traversal in progress while the dock is collapsed (its default
     * state),
     * when traversal-step events arrive,
     * then the trace keeps updating, and the full trail is there on expand.
     */
    const user = userEvent.setup();
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <SessionHarness apiRef={apiRef} />
        <TraceProbe />
        <ChatDock />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    act(() => {
      apiRef.current!.submit("Trace this");
    });

    act(() => {
      ws.emitMessage({ type: "visit_node", node_id: "n1", concept: "Alpha", hop: 0, via_relation: null });
    });
    act(() => {
      ws.emitMessage({ type: "visit_node", node_id: "n2", concept: "Beta", hop: 1, via_relation: "relates_to" });
    });

    expect(screen.getByTestId("trace-step-count").textContent).toBe("2");

    await user.click(screen.getByTestId("chat-dock-toggle"));
    expect(screen.getByTestId("trace-step-count").textContent).toBe("2");
  });
});
