/**
 * Unit tests for the shared CollapsiblePanel component used by both the folder
 * panel and the chat panel.
 * Covers: collapsing hides content, expanding restores it.
 * Source: Feature: Collapsible Chat Panel (docs/frontend/features.md), Issue 13
 * (also backs the folder panel's collapse behavior referenced in Issue 5).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsiblePanel } from "../../src/components/ui/CollapsiblePanel";

afterEach(() => {
  cleanup();
});

describe("CollapsiblePanel", () => {
  it("collapses and hides its content when toggled closed", async () => {
    /**
     * Given a collapsible panel rendered in its expanded state,
     * when its collapse toggle is activated,
     * then the panel's content is no longer visible and a re-expand affordance remains.
     *
     * Source: Feature: Collapsible Chat Panel — criterion 1
     */
    const user = userEvent.setup();
    render(
      <CollapsiblePanel title="Folder" defaultOpen>
        <p>Panel content</p>
      </CollapsiblePanel>
    );

    expect(screen.getByText("Panel content")).toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: /collapse folder/i });
    await user.click(trigger);

    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
    // The re-expand affordance (the same trigger, now offering to expand) remains.
    expect(screen.getByRole("button", { name: /expand folder/i })).toBeInTheDocument();
  });

  it("restores its content when toggled back open", async () => {
    /**
     * Given a collapsible panel in its collapsed state,
     * when its expand toggle is activated,
     * then the panel's content is visible again.
     *
     * Source: Feature: Collapsible Chat Panel — criterion 2
     */
    const user = userEvent.setup();
    render(
      <CollapsiblePanel title="Folder" defaultOpen={false}>
        <p>Panel content</p>
      </CollapsiblePanel>
    );

    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: /expand folder/i });
    await user.click(trigger);

    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });
});
