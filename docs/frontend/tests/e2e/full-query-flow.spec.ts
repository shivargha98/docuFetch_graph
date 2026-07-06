/**
 * End-to-end test for the full query flow: configuring a folder, watching
 * ingestion populate the 3D graph, asking a question, watching traversal
 * highlight with camera-follow, and seeing the trace collapse into a final answer.
 * Requires the real FastAPI backend running with a valid ingestible folder.
 * Source: PRD user stories 1, 5, 7, 8, 12, 13, 14, 15, 16, 17;
 * Issues 4, 5, 6, 7, 9, 10, 11.
 */
import { test, expect } from "@playwright/test";

test("user configures a folder, watches the graph populate, asks a question, and sees a traced answer", async ({ page }) => {
  /**
   * Given the app is loaded against a real running backend with a valid folder
   * available to ingest,
   * when the user submits the folder path, waits for ingestion to populate the
   * graph, then asks a question,
   * then: the graph visibly populates with nodes as ingestion proceeds; submitting
   * a question triggers visible sequential node/edge highlighting with camera
   * movement; the trace block live-updates during traversal and collapses into a
   * "show reasoning path" summary; a 4-5 line answer appears beneath it.
   *
   * Source: PRD user stories 1, 5, 7, 8, 12, 13, 14, 15, 16, 17
   */
  throw new Error("Not implemented");
});
