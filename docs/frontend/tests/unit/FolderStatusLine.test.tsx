/**
 * Unit tests for FolderStatusLine, the presentational status indicator in the
 * folder panel.
 * Covers: rendering of the watching, idle, and in-progress-extraction status variants.
 * Source: Feature: Live Ingestion Status Display (docs/frontend/features.md), Issue 5.
 */
import { describe, it, expect } from "vitest";

describe("FolderStatusLine", () => {
  it('renders a "Watching" status variant', () => {
    /**
     * Given a status prop of { state: "watching", queued: 3 },
     * when the status line renders,
     * then the rendered text reflects "watching" with the queued count.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    throw new Error("Not implemented");
  });

  it('renders an "Idle · up to date" status variant', () => {
    /**
     * Given a status prop of { state: "idle" },
     * when the status line renders,
     * then the rendered text reflects an idle/up-to-date state.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    throw new Error("Not implemented");
  });

  it("renders an in-progress extraction status with the current filename", () => {
    /**
     * Given a status prop of { state: "extracting", file: "notes.md" },
     * when the status line renders,
     * then the rendered text names the file currently being extracted.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    throw new Error("Not implemented");
  });
});
