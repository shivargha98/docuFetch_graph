/**
 * Unit tests for AnswerMessage, the chat entry rendering the final 4-5 line answer.
 * Source: Feature: Answer Display (docs/frontend/features.md), Issue 11.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChatMessageAnswer } from "../../src/components/chat/ChatMessageAnswer";
import { TraceBlock } from "../../src/components/chat/TraceBlock";
import type { AnswerMessage, Trace } from "../../src/state/types";

afterEach(() => {
  cleanup();
});

const TRACE: Trace = {
  queryId: "q1",
  collapsed: true,
  steps: [{ nodeId: "n1", concept: "Alpha", hop: 0, viaRelation: null }],
};

const MESSAGE: AnswerMessage = { kind: "answer", id: "m1", text: "docuFetch is a personal LLM wiki." };

describe("AnswerMessage", () => {
  it("renders the answer text with normal accent styling beneath the trace summary", () => {
    /**
     * Given an answer message with text and an associated (collapsed) trace summary,
     * when the chat entry renders,
     * then the answer text is visible beneath the trace summary and carries the
     * normal (non-muted) accent styling class/token.
     *
     * Source: Feature: Answer Display — criteria 1-2
     */
    render(
      <div>
        <TraceBlock trace={TRACE} />
        <ChatMessageAnswer message={MESSAGE} />
      </div>
    );

    const answerEl = screen.getByTestId("chat-message-answer");
    expect(answerEl).toHaveTextContent(MESSAGE.text);
    expect(answerEl.className).toMatch(/text-ion/);
    expect(answerEl.className).not.toMatch(/text-muted/);

    const traceEl = screen.getByTestId("trace-block");
    const position = traceEl.compareDocumentPosition(answerEl);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
