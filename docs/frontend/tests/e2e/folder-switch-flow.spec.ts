/**
 * End-to-end test for switching folders mid-session: verifies the graph and
 * chat both reset to the new folder's state. Requires the real running backend.
 * Source: PRD user story 4; Feature: Folder Switching & Session Reset; Issue 14.
 */
import { test, expect } from "@playwright/test";

test("user switches to a different folder mid-session and sees the graph and chat reset", async ({ page }) => {
  /**
   * Given the app is loaded with one folder already ingested and a chat history present,
   * when the user submits a different valid folder path,
   * then the graph view updates to the new folder's concepts (old graph is gone)
   * and the chat transcript is cleared with a fresh session beginning.
   *
   * Source: PRD user story 4
   */
  throw new Error("Not implemented");
});
