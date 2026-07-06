/**
 * End-to-end test for the no-relevant-document flow: asking a question with no
 * grounding material and seeing the visually distinct muted no-match message
 * with no trace block. Requires the real running backend.
 * Source: PRD user stories 18, 19; Feature: No-Match Message Display; Issue 12.
 */
import { test, expect } from "@playwright/test";

test("user asks a question with no relevant material and sees a muted no-match message with no trace", async ({ page }) => {
  /**
   * Given the app is loaded against a real running backend with an ingested folder,
   * when the user asks a question with no relevant grounding material,
   * then a muted/neutral-styled message appears, distinct from a normal answer,
   * with no trace block rendered for that message.
   *
   * Source: PRD user stories 18, 19
   */
  throw new Error("Not implemented");
});
