/**
 * Unit tests for FolderStatusLine, the presentational status indicator in the
 * folder panel.
 * Covers: rendering of the watching, idle, and in-progress-extraction status variants.
 * Source: Feature: Live Ingestion Status Display (docs/frontend/features.md), Issue 5.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FolderStatusLine } from "../../src/components/folder/FolderStatusLine";

afterEach(() => {
  cleanup();
});

describe("FolderStatusLine", () => {
  it('renders a "Watching" status variant', () => {
    /**
     * Given a status prop of { state: "watching", queued: 3 },
     * when the status line renders,
     * then the rendered text reflects "watching" with the queued count.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    render(<FolderStatusLine status={{ state: "watching", queued: 3 }} />);

    const line = screen.getByTestId("folder-status-line");
    expect(line).toHaveTextContent(/watching/i);
    expect(line).toHaveTextContent("3");
  });

  it('renders an "Idle · up to date" status variant', () => {
    /**
     * Given a status prop of { state: "idle" },
     * when the status line renders,
     * then the rendered text reflects an idle/up-to-date state.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    render(<FolderStatusLine status={{ state: "idle" }} />);

    const line = screen.getByTestId("folder-status-line");
    expect(line).toHaveTextContent(/idle/i);
    expect(line).toHaveTextContent(/up to date/i);
  });

  it("renders an in-progress extraction status with the current filename", () => {
    /**
     * Given a status prop of { state: "extracting", file: "notes.md" },
     * when the status line renders,
     * then the rendered text names the file currently being extracted.
     *
     * Source: Feature: Live Ingestion Status Display — criterion 2
     */
    render(<FolderStatusLine status={{ state: "extracting", file: "notes.md" }} />);

    const line = screen.getByTestId("folder-status-line");
    expect(line).toHaveTextContent(/extracting/i);
    expect(line).toHaveTextContent("notes.md");
  });
});
