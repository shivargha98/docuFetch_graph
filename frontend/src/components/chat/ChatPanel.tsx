/**
 * Chat panel: hosts the connection status chip, transcript, and question
 * input inside the shared collapsible glass-panel shell. Owns the
 * `useChatSession` (and, transitively, `useWebSocket`) hook call at this
 * component's top level -- ChatPanel itself is mounted once, unconditionally,
 * by the app shell and never unmounts, so the live socket connection and any
 * in-progress traversal keep running even while the panel is collapsed. The
 * panel also opts into `CollapsiblePanel`'s `forceMount` + `shrinkWidthOnCollapse`
 * behavior so the transcript's scroll position survives a collapse cycle and
 * the freed width is handed back to the graph view.
 */
import { CollapsiblePanel } from "../ui/CollapsiblePanel";
import { useChatSession } from "../../hooks/useChatSession";
import { ChatTranscript } from "./ChatTranscript";
import { ChatInput } from "./ChatInput";
import { ConnectionStatusChip } from "./ConnectionStatusChip";

interface ChatPanelProps {
  /** Optional extra classes for panel sizing within the app shell. */
  className?: string;
}

/** Renders the chat panel with a stable `chat-panel` test id. */
export function ChatPanel({ className }: ChatPanelProps) {
  const { messages, submit, queryInProgress, connectionStatus } = useChatSession();

  return (
    <CollapsiblePanel
      title="Chat"
      testId="chat-panel"
      className={className}
      forceMount
      shrinkWidthOnCollapse
    >
      <div className="flex flex-col h-full gap-3">
        <ConnectionStatusChip status={connectionStatus} />
        <ChatTranscript messages={messages} />
        <ChatInput onSubmit={submit} disabled={queryInProgress} />
      </div>
    </CollapsiblePanel>
  );
}
