/**
 * Integration tests for useFolderSwitch, which tears down and resets graph,
 * chat, and ingestion state when the user submits a new folder path after one
 * is already loaded.
 * Source: Feature: Folder Switching & Session Reset (docs/frontend/features.md), Issue 14.
 *
 * Caveat: pending backend Issue 15 for the folder-configuration contract's exact shape.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mockFetch, resetAllMocks } from "../setup";

afterEach(() => {
  resetAllMocks();
});

describe("useFolderSwitch", () => {
  it("clears the currently displayed graph when a new valid folder path is submitted", () => {
    /**
     * Given a folder is already loaded with a populated graph, and fetch is mocked
     * to accept a new folder path,
     * when a new valid folder path is submitted,
     * then graph state is cleared (zero nodes/edges) before the new folder's graph loads.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 1
     */
    throw new Error("Not implemented");
  });

  it("clears the chat transcript and starts a fresh session with no carried-over history", () => {
    /**
     * Given an existing chat transcript with prior turns,
     * when a new valid folder path is submitted,
     * then the chat transcript is emptied with no prior turn history retained.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 2
     */
    throw new Error("Not implemented");
  });

  it("resets ingestion status to reflect the newly submitted folder", () => {
    /**
     * Given ingestion status showing progress for the previous folder,
     * when a new valid folder path is submitted,
     * then ingestion status resets rather than continuing to show the previous
     * folder's stale status.
     *
     * Source: Feature: Folder Switching & Session Reset — criterion 3
     */
    throw new Error("Not implemented");
  });
});
