/**
 * Renders a single Haiku-summarized answer message in the chat transcript --
 * the "real answer" arriving beneath its query's (collapsed) reasoning-path
 * trace summary. Uses the ion accent with a soft glow so an answer reads,
 * at a glance, as the opposite of a no-match entry's deliberately unglowing
 * muted treatment (see ChatMessageNoMatch.tsx).
 */
import type { AnswerMessage } from "../../state/types";

interface ChatMessageAnswerProps {
  message: AnswerMessage;
}

/** Renders one answer message in the ion accent, with a soft glow. */
export function ChatMessageAnswer({ message }: ChatMessageAnswerProps) {
  return (
    <p
      data-testid="chat-message-answer"
      className="font-body text-sm text-ion leading-relaxed drop-shadow-[0_0_10px_rgba(110,231,249,0.35)]"
    >
      {message.text}
    </p>
  );
}
