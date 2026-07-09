/**
 * Renders the chat transcript as an ordered list of messages, delegating
 * per-kind rendering to small dedicated components (one file per message
 * kind under this directory) so later rounds can restyle each kind
 * independently without touching this list logic.
 *
 * Round 3 (Issue 10) additions:
 * - Mounts `useTraversalSync()` here (rather than in ChatDock, which isn't
 *   in this round's owned-file list) so the trace-driven graph
 *   highlight/camera-follow sync keeps running for as long as the transcript
 *   stays mounted -- which, thanks to `ChatDock` keeping its body CSS-hidden
 *   rather than unmounted while collapsed, is
 *   unconditional, even while the chat panel is collapsed. Mirrors
 *   `useChatSession`'s own always-mounted rationale.
 * - Pairs each completed query's trace with its answer message so a
 *   `TraceBlock` renders immediately above `ChatMessageAnswer`, and never
 *   above `ChatMessageNoMatch`. Backend chat messages don't carry a
 *   `queryId` (frozen `useChatSession.ts`/`state/types.ts` never attach one),
 *   but per the WS contract exactly one `Trace` is produced per query --
 *   whether it ends in an answer or a no-match -- in the same order queries
 *   were submitted, and answer/no_match messages are appended in that same
 *   order. So `traces[i]` is paired with the i-th non-user message by
 *   position via `traceCursor`. A no-match message still consumes its trace
 *   slot (to keep later pairings aligned) even though nothing is rendered
 *   for it, matching the brief's "no trace shown for no-match, even if one
 *   exists for that queryId" rule.
 */
import type { ChatMessage } from "../../state/types";
import { useChatState } from "../../state/providers";
import { useTraversalSync } from "../../hooks/useTraversalSync";
import { ChatMessageUser } from "./ChatMessageUser";
import { ChatMessageAnswer } from "./ChatMessageAnswer";
import { ChatMessageNoMatch } from "./ChatMessageNoMatch";
import { TraceBlock } from "./TraceBlock";

interface ChatTranscriptProps {
  messages: ChatMessage[];
}

/** Renders each transcript message via its kind-specific component, in order, pairing traces with their answers. */
export function ChatTranscript({ messages }: ChatTranscriptProps) {
  useTraversalSync();
  const { state: chatState } = useChatState();

  let traceCursor = 0;

  return (
    <div
      data-testid="chat-transcript"
      className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2"
    >
      {messages.map((message) => {
        switch (message.kind) {
          case "user":
            return <ChatMessageUser key={message.id} message={message} />;
          case "answer": {
            const trace = chatState.traces[traceCursor];
            traceCursor += 1;
            return (
              <div key={message.id} className="flex flex-col gap-1">
                {trace && <TraceBlock trace={trace} />}
                <ChatMessageAnswer message={message} />
              </div>
            );
          }
          case "no_match":
            // A trace may exist for this query per the WS contract, but it's
            // deliberately never rendered for a no-match outcome -- still
            // consume the slot so later answers keep pairing correctly.
            traceCursor += 1;
            return <ChatMessageNoMatch key={message.id} message={message} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
