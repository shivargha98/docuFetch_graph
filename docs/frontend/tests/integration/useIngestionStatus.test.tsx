/**
 * Integration tests for useIngestionStatus, which drives the folder panel's
 * live status indicator from backend-pushed events.
 * Source: Feature: Live Ingestion Status Display (docs/frontend/features.md), Issue 5.
 *
 * Caveat: pending backend Issue 14 — both the full event schema and whether
 * ingestion status shares the chat WebSocket channel or a second dedicated
 * channel are undecided; the mocked event stream here is illustrative only.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mockWebSocket, resetAllMocks } from "../setup";

afterEach(() => {
  resetAllMocks();
});

describe("useIngestionStatus", () => {
  it("updates the displayed status without a manual refresh as mocked ingestion events arrive", () => {
    /**
     * Given a mocked event stream emitting a sequence of ingestion status events,
     * when each event is emitted,
     * then the displayed status updates to match each event without a refresh.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 1
     */
    throw new Error("Not implemented");
  });

  it("reflects both actively-watching/idle state and in-flight extraction progress", () => {
    /**
     * Given a mocked event sequence transitioning watching -> extracting -> idle,
     * when each event is processed,
     * then the status reflects each state transition accurately, including the
     * file being extracted mid-sequence.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    throw new Error("Not implemented");
  });

  it("retains ingestion status when the folder panel is collapsed and re-expanded", () => {
    /**
     * Given a current ingestion status is displayed,
     * when the folder panel is collapsed and then re-expanded,
     * then the same status is shown after re-expanding, not a reset/blank state.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 3
     */
    throw new Error("Not implemented");
  });
});
