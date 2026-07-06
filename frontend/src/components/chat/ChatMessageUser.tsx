/**
 * Renders a single user-submitted question in the chat transcript. Round 3
 * owns the full visual treatment for this message kind; this round keeps it
 * to a minimal, legibly-styled entry.
 */
import type { UserMessage } from "../../state/types";

interface ChatMessageUserProps {
  message: UserMessage;
}

/** Renders one user question, right-aligned in the ion accent color. */
export function ChatMessageUser({ message }: ChatMessageUserProps) {
  return (
    <p data-testid="chat-message-user" className="font-body text-sm text-ion self-end text-right">
      {message.text}
    </p>
  );
}
