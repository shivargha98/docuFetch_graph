/**
 * Chat question input plus submit control. Submitting sends the trimmed
 * question through the `onSubmit` callback and clears the field; both the
 * field and the submit control are disabled while a query is already in
 * flight, enforcing the no-overlapping-queries rule from the caller.
 */
import { useState, type FormEvent } from "react";

interface ChatInputProps {
  /** Called with the trimmed question text on submission of a non-empty value. */
  onSubmit: (text: string) => void;
  /** Disables the input and submit control while a query is in flight. */
  disabled: boolean;
}

/** Renders a single-line question form that clears itself after submission. */
export function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  /** Submits the current field value if non-empty, then clears the field. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        placeholder="Ask a question..."
        aria-label="Chat question"
        className="flex-1 bg-transparent border border-glass-border rounded-md px-3 py-2 text-sm font-body text-text-primary placeholder:text-text-secondary disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled}
        className="font-display text-sm text-ion hover:text-synapse transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        Ask
      </button>
    </form>
  );
}
