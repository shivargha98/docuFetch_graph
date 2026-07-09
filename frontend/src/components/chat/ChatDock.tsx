/**
 * LinkedIn-style bottom-docked chat window, replacing the old fixed right
 * chat panel so the graph keeps the full width. A compact glass bar sits
 * pinned to the viewport's bottom-right corner showing the connection chip +
 * "Chat" title; pressing the bar expands the chat window (transcript +
 * input) above it, pressing again collapses back to the bar. Starts
 * collapsed. Answers that arrive while collapsed show an unread-count badge
 * on the bar (the dock never opens itself — user's explicit choice over
 * auto-expand); opening clears it.
 *
 * Owns the `useChatSession` (and, transitively, `useWebSocket`) hook call at
 * this component's top level — ChatDock is mounted once, unconditionally, by
 * the app shell and never unmounts. The body is hidden with CSS while
 * collapsed, NEVER unmounted (the old panel's forceMount rationale):
 * ChatTranscript hosts useTraversalSync (single-mount, module-level refs),
 * the socket and in-flight traversals must keep running, and the
 * transcript's scroll position must survive a collapse cycle.
 *
 * Design (frontend-design skill vocabulary): the bar reuses the glass-panel
 * surface + font-display title + lucide chevron grammar the old shared
 * CollapsiblePanel established, so the dock reads as the same panel family,
 * just re-anchored.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/utils";
import { useChatSession } from "../../hooks/useChatSession";
import { ChatTranscript } from "./ChatTranscript";
import { ChatInput } from "./ChatInput";
import { ConnectionStatusChip } from "./ConnectionStatusChip";

/** Renders the bottom-docked chat: persistent toggle bar + collapsible window. */
export function ChatDock() {
  const { messages, submit, queryInProgress, connectionStatus } = useChatSession();
  const [open, setOpen] = useState(false);

  // Unread badge (LinkedIn-true, per the design Q&A: answers arriving while
  // collapsed badge the bar — the dock never opens itself). Counts assistant
  // messages (answer/no_match) that land while closed; opening clears it.
  // A shrinking count means the session was reset (folder switch) — clear.
  const [unreadCount, setUnreadCount] = useState(0);
  const assistantCount = messages.filter((message) => message.kind !== "user").length;
  const previousAssistantCountRef = useRef(assistantCount);
  useEffect(() => {
    const previous = previousAssistantCountRef.current;
    previousAssistantCountRef.current = assistantCount;
    if (assistantCount < previous) {
      setUnreadCount(0);
    } else if (assistantCount > previous && !open) {
      setUnreadCount((count) => count + (assistantCount - previous));
    }
  }, [assistantCount, open]);
  useEffect(() => {
    if (open) setUnreadCount(0);
  }, [open]);

  return (
    <div
      data-testid="chat-dock"
      className={cn(
        "glass-panel fixed bottom-0 right-4 z-30 flex flex-col rounded-t-xl shadow-glow-soft",
        open ? "w-96 max-w-[calc(100vw-2rem)]" : "w-80 max-w-[calc(100vw-2rem)]"
      )}
    >
      <button
        type="button"
        data-testid="chat-dock-toggle"
        aria-expanded={open}
        aria-label={open ? "Collapse chat" : "Expand chat"}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:text-ion",
          open && "border-b border-glass-border"
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="font-display text-sm tracking-wide text-text-primary">Chat</span>
          <ConnectionStatusChip status={connectionStatus} />
          {!open && unreadCount > 0 && (
            <span
              data-testid="chat-unread-badge"
              className="rounded-full border border-ion/60 bg-ion/15 px-1.5 font-mono text-[10px] leading-4 text-ion"
            >
              {unreadCount}
            </span>
          )}
        </span>
        <span aria-hidden="true" className="text-ion">
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </button>
      <div
        data-testid="chat-dock-body"
        className={cn("h-[28rem] max-h-[70vh] flex-col gap-3 p-4", open ? "flex" : "hidden")}
      >
        <ChatTranscript messages={messages} />
        <ChatInput onSubmit={submit} disabled={queryInProgress} />
      </div>
    </div>
  );
}
