/**
 * Integration tests for the chat panel's collapse/expand behavior, verifying
 * transcript and in-progress traversal state survive a collapse/re-expand cycle.
 * Source: Feature: Collapsible Chat Panel (docs/frontend/features.md), Issue 13.
 *
 * jsdom has no real layout/CSS engine and this suite doesn't load the compiled
 * Tailwind stylesheet, so "expands into freed width" and "hidden while
 * collapsed" are asserted the same way tests/unit/AppShell.test.tsx asserts
 * the responsive shell contract: via the Tailwind utility classes and Radix
 * `data-state` attributes that *encode* the behavior, not computed pixels.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { mockWebSocket, resetAllMocks } from "../setup";
import { AppProviders, useIngestionState, useChatState } from "../../src/state/providers";
import { ChatPanel } from "../../src/components/chat/ChatPanel";
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

/** Reads the live trace step count for the first query directly from context, independent of ChatPanel's own (collapsible) rendering. */
function TraceProbe() {
  const { state } = useChatState();
  const trace = state.traces[0];
  return <div data-testid="trace-step-count">{trace ? trace.steps.length : 0}</div>;
}

describe("ChatPanelCollapse", () => {
  it("hides the chat panel and expands the graph view's available width when collapsed", async () => {
    /**
     * Given the chat panel is expanded,
     * when it is collapsed,
     * then the chat panel's content is hidden and the graph view's container
     * grows to occupy the freed width.
     *
     * Source: Feature: Collapsible Chat Panel — criterion 1
     */
    const user = userEvent.setup();
    mockWebSocket();
    render(
      <AppProviders>
        <div className="flex flex-row">
          <div data-testid="graph-view-stub" className="flex-1" />
          <ChatPanel className="md:w-96 md:flex-none" />
        </div>
      </AppProviders>
    );

    const chatPanel = screen.getByTestId("chat-panel");
    const content = screen.getByTestId("chat-panel-content");
    expect(chatPanel.className).not.toContain("md:w-auto");
    expect(content.getAttribute("data-state")).toBe("open");

    const trigger = screen.getByRole("button", { name: /collapse chat/i });
    await user.click(trigger);

    // Content is marked closed and visually hidden via our own class, but stays
    // mounted (forceMount) so its scroll position survives -- see next test.
    expect(content.getAttribute("data-state")).toBe("closed");
    expect(content.className).toContain("hidden");
    // The panel's own width override kicks in, freeing horizontal space for
    // the graph view (a flex-1 sibling) to occupy -- flexbox handles the rest.
    expect(chatPanel.className).toContain("md:w-auto");
  });

  it("restores the chat panel with its prior transcript and scroll position when re-expanded", async () => {
    /**
     * Given a chat panel with transcript history and a specific scroll position,
     * then collapsed,
     * when it is re-expanded,
     * then the same transcript is shown and the scroll position is restored.
     *
     * Source: Feature: Collapsible Chat Panel — criterion 2
     */
    const user = userEvent.setup();
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <SessionHarness apiRef={apiRef} />
        <ChatPanel />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    act(() => {
      apiRef.current!.submit("What is docuFetch?");
    });

    expect(screen.getByText("What is docuFetch?")).toBeInTheDocument();

    const transcript = screen.getByTestId("chat-transcript");
    transcript.scrollTop = 42;

    const trigger = screen.getByRole("button", { name: /collapse chat/i });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /expand chat/i }));

    expect(screen.getByText("What is docuFetch?")).toBeInTheDocument();
    expect(screen.getByTestId("chat-transcript").scrollTop).toBe(42);
  });

  it("continues updating an in-progress traversal while the chat panel is collapsed", async () => {
    /**
     * Given a traversal in progress when the chat panel is collapsed,
     * when traversal-step events continue to arrive while collapsed, then the
     * panel is re-expanded,
     * then the trace reflects all events that occurred while collapsed.
     *
     * Source: Feature: Collapsible Chat Panel — criterion 3
     */
    const user = userEvent.setup();
    const ws = mockWebSocket();
    const apiRef: { current: UseChatSessionResult | null } = { current: null };
    render(
      <AppProviders>
        <SessionHarness apiRef={apiRef} />
        <TraceProbe />
        <ChatPanel />
      </AppProviders>
    );

    act(() => {
      ws.emitOpen();
    });
    act(() => {
      apiRef.current!.submit("Trace this");
    });

    const trigger = screen.getByRole("button", { name: /collapse chat/i });
    await user.click(trigger);

    act(() => {
      ws.emitMessage({ type: "visit_node", node_id: "n1", concept: "Alpha", hop: 0, via_relation: null });
    });
    act(() => {
      ws.emitMessage({ type: "visit_node", node_id: "n2", concept: "Beta", hop: 1, via_relation: "relates_to" });
    });

    // State kept flowing while collapsed -- the probe lives outside the
    // collapsible content and is never affected by its collapse state.
    expect(screen.getByTestId("trace-step-count").textContent).toBe("2");

    await user.click(screen.getByRole("button", { name: /expand chat/i }));

    expect(screen.getByTestId("trace-step-count").textContent).toBe("2");
  });
});
