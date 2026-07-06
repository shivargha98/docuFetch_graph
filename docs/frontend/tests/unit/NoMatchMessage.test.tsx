/**
 * Unit tests for NoMatchMessage, the visually distinct chat entry rendered when
 * the backend reports no relevant document was found.
 * Source: Feature: No-Match Message Display (docs/frontend/features.md), Issue 12.
 */
import { describe, it, expect } from "vitest";

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
    throw new Error("Not implemented");
  });

  it("renders with no trace block attached", () => {
    /**
     * Given a no-match chat entry,
     * when it renders,
     * then no trace block (collapsed or expanded) is present alongside it.
     *
     * Source: Feature: No-Match Message Display — criterion 2
     */
    throw new Error("Not implemented");
  });

  it("is visually distinguishable from a normal answer at a glance", () => {
    /**
     * Given a normal answer entry and a no-match entry rendered together in a transcript,
     * when their style classes/tokens are compared,
     * then the two entries resolve to different styling classes/tokens.
     *
     * Source: Feature: No-Match Message Display — criterion 3
     */
    throw new Error("Not implemented");
  });
});
