/**
 * Unit tests for NoMatchMessage, the visually distinct chat entry rendered when
 * the backend reports no relevant document was found.
 * Source: Feature: No-Match Message Display (docs/frontend/features.md), Issue 12.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChatMessageAnswer } from "../../src/components/chat/ChatMessageAnswer";
import { ChatMessageNoMatch } from "../../src/components/chat/ChatMessageNoMatch";
import type { AnswerMessage, NoMatchMessage } from "../../src/state/types";

afterEach(() => {
  cleanup();
});

const NO_MATCH_MESSAGE: NoMatchMessage = {
  kind: "no_match",
  id: "m1",
  message: "No relevant document was found for that question.",
};

const ANSWER_MESSAGE: AnswerMessage = { kind: "answer", id: "m2", text: "docuFetch is a personal LLM wiki." };

describe("NoMatchMessage", () => {
  it("renders in a muted/neutral style distinct from the normal answer accent color", () => {
    /**
     * Given a no-match chat entry,
     * when it renders,
     * then it carries a muted/neutral styling class/token, not the normal-answer
     * accent class/token.
     *
     * Source: Feature: No-Match Message Display — criterion 1
     */
    render(<ChatMessageNoMatch message={NO_MATCH_MESSAGE} />);

    const el = screen.getByTestId("chat-message-no-match");
    expect(el.className).toMatch(/text-muted/);
    expect(el.className).not.toMatch(/text-ion/);
  });

  it("renders with no trace block attached", () => {
    /**
     * Given a no-match chat entry,
     * when it renders,
     * then no trace block (collapsed or expanded) is present alongside it.
     *
     * Source: Feature: No-Match Message Display — criterion 2
     */
    render(<ChatMessageNoMatch message={NO_MATCH_MESSAGE} />);

    expect(screen.queryByTestId("trace-block")).not.toBeInTheDocument();
  });

  it("is visually distinguishable from a normal answer at a glance", () => {
    /**
     * Given a normal answer entry and a no-match entry rendered together in a transcript,
     * when their style classes/tokens are compared,
     * then the two entries resolve to different styling classes/tokens.
     *
     * Source: Feature: No-Match Message Display — criterion 3
     */
    render(
      <div>
        <ChatMessageAnswer message={ANSWER_MESSAGE} />
        <ChatMessageNoMatch message={NO_MATCH_MESSAGE} />
      </div>
    );

    const answerEl = screen.getByTestId("chat-message-answer");
    const noMatchEl = screen.getByTestId("chat-message-no-match");
    expect(answerEl.className).not.toBe(noMatchEl.className);
  });
});
