/**
 * Integration tests for useFolderConfig, which submits the folder path to the
 * backend's folder-configuration endpoint and surfaces validation results.
 * Source: Feature: Folder Path Input & Validation (docs/frontend/features.md), Issue 4.
 *
 * Caveat: the mocked request/response payload shape used throughout this file is
 * illustrative and provisional, pending backend Issue 15. These tests assert only
 * the fixed behavior (success clears error and updates state; failure surfaces an
 * error), not a specific field-level schema.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mockFetch, resetAllMocks } from "../setup";

afterEach(() => {
  resetAllMocks();
});

describe("useFolderConfig", () => {
  it("submits a valid folder path and clears prior error state", () => {
    /**
     * Given a prior inline error is set, and fetch is mocked to return a success
     * response for the folder-configuration endpoint,
     * when a valid path is submitted,
     * then the prior error state is cleared and ingestion state updates to reflect
     * the newly active folder.
     *
     * Source: Feature: Folder Path Input & Validation — criterion 2
     */
    throw new Error("Not implemented");
  });

  it("surfaces an inline error and does not crash when the backend reports an invalid/unreadable path", () => {
    /**
     * Given fetch is mocked to return an error response for the folder-configuration endpoint,
     * when an invalid path is submitted,
     * then an inline error is displayed and the component tree remains mounted and interactive.
     *
     * Source: Feature: Folder Path Input & Validation — criterion 3
     */
    throw new Error("Not implemented");
  });
});
