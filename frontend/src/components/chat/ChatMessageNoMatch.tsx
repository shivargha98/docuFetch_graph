/**
 * Renders a "no relevant document found" message in the chat transcript,
 * using the muted/unglowing token so its lack of glow -- no border, no
 * shadow, no accent hue -- reads as a meaningful signal, deliberately
 * distinct from ChatMessageAnswer's ion glow at a glance. No trace block is
 * ever rendered alongside this message kind (see ChatTranscript.tsx's
 * trace/answer pairing logic).
 */
import type { NoMatchMessage } from "../../state/types";

interface ChatMessageNoMatchProps {
  message: NoMatchMessage;
}

/** Renders one no-match message in the flat muted tone, with no glow/accent. */
export function ChatMessageNoMatch({ message }: ChatMessageNoMatchProps) {
  return (
    <p data-testid="chat-message-no-match" className="font-mono text-sm text-muted italic">
      {message.message}
    </p>
  );
}
