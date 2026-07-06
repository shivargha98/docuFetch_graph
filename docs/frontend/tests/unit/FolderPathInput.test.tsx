/**
 * Unit tests for FolderPathInput.
 * Covers: default-folder prefill and inline error display, as pure presentational
 * behavior driven by props (network-calling behavior is covered separately in
 * tests/integration/useFolderConfig.test.tsx).
 * Source: Feature: Folder Path Input & Validation (docs/frontend/features.md), Issue 4.
 */
import { describe, it, expect } from "vitest";

describe("FolderPathInput", () => {
  it("pre-fills the input with the provided default watched folder on first render", () => {
    /**
     * Given a `defaultFolder` prop is passed to the folder path input,
     * when the component renders for the first time,
     * then the input's value equals the provided `defaultFolder`.
     *
     * Source: Feature: Folder Path Input & Validation — criterion 1
     */
    throw new Error("Not implemented");
  });

  it("displays an inline error message when an error prop is set", () => {
    /**
     * Given an `error` prop with a message is passed to the folder path input,
     * when the component renders,
     * then the error message is visible near the input and the panel does not
     * unmount or blank out any other content.
     *
     * Source: Feature: Folder Path Input & Validation — criterion 3
     */
    throw new Error("Not implemented");
  });
});
