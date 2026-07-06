/**
 * Integration tests for useChatSession, which handles submitting a chat
 * question over the WebSocket connection and appending it to the transcript.
 * Source: Feature: Chat Query Submission (docs/frontend/features.md), Issue 9.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mockWebSocket, resetAllMocks } from "../setup";

afterEach(() => {
  resetAllMocks();
});

describe("useChatSession", () => {
  it("sends a submitted question over the active WebSocket connection and appends it to the transcript", () => {
    /**
     * Given an active mocked WebSocket connection,
     * when a non-empty question is submitted,
     * then the question is sent over the connection and appears as a new entry
     * in the visible transcript.
     *
     * Source: Feature: Chat Query Submission — criterion 1
     */
    throw new Error("Not implemented");
  });

  it("disables the chat input while a traversal is already in progress", () => {
    /**
     * Given a submitted question with traversal still in progress (no completion
     * event yet),
     * when the user attempts to submit a second question,
     * then the input is disabled or the second submission is queued rather than
     * sent immediately.
     *
     * Source: Feature: Chat Query Submission — criterion 2
     */
    throw new Error("Not implemented");
  });

  it("does not send or append anything when the submitted question is empty", () => {
    /**
     * Given an empty input value,
     * when submission is triggered,
     * then no message is sent over the connection and no new transcript entry is added.
     *
     * Source: Feature: Chat Query Submission — criterion 3
     */
    throw new Error("Not implemented");
  });
});
