/**
 * Unit tests for the AppShell component.
 * Covers: three-panel desktop layout, tablet-width panel stacking, and the
 * graph view retaining a usable size at both breakpoints.
 * Source: Feature: Three-Panel Responsive Layout (docs/frontend/features.md), Issue 1.
 *
 * jsdom does not run a real layout/CSS engine, so these tests can't assert on
 * computed pixel widths. Instead they assert on the Tailwind utility classes
 * that *encode* the responsive contract: the shell container is `flex-col`
 * (mobile-first default -- this is the stacked state, active below the `md`
 * breakpoint with no media query needed) and switches to `md:flex-row` at/above
 * the tablet-width (`md`, 768px) breakpoint. The graph view always carries a
 * `flex-1` growth class (so it dominates the row once panels sit side-by-side)
 * and a `min-h-[320px]` floor class (so it never collapses below a usable size,
 * in either stacked or row layout). Real visual verification of breakpoint
 * behavior belongs to the Playwright e2e suite (tests/e2e/responsive-tablet.spec.ts).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import App from "../../src/App";

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("renders three panels side-by-side at desktop width", () => {
    /**
     * Given the app shell is rendered at a desktop viewport width,
     * when the initial render completes,
     * then the folder panel, graph view, and chat panel are all present,
     * and the graph view occupies the majority of the horizontal space.
     *
     * Source: Feature: Three-Panel Responsive Layout — criterion 1
     */
    render(<App />);

    const folderPanel = screen.getByTestId("folder-panel");
    const graphView = screen.getByTestId("graph-view");
    const chatPanel = screen.getByTestId("chat-panel");
    expect(folderPanel).toBeInTheDocument();
    expect(graphView).toBeInTheDocument();
    expect(chatPanel).toBeInTheDocument();

    // The shell switches to a side-by-side row at/above the tablet breakpoint.
    const shell = graphView.parentElement;
    expect(shell?.className).toContain("md:flex-row");

    // The graph view grows to fill remaining space; the flanking panels are
    // fixed-width, so the graph view takes the majority of the row's width.
    expect(graphView.className).toContain("flex-1");
    expect(folderPanel.className).toContain("md:flex-none");
    expect(chatPanel.className).toContain("md:flex-none");
  });

  it("stacks panels vertically below the tablet-width breakpoint", () => {
    /**
     * Given the app shell is rendered at a viewport width below the tablet breakpoint,
     * when the initial render completes,
     * then the three panels render stacked vertically with no clipping/overflow.
     *
     * Source: Feature: Three-Panel Responsive Layout — criterion 2
     */
    render(<App />);

    const graphView = screen.getByTestId("graph-view");
    const shell = graphView.parentElement;
    // `flex-col` is the unprefixed (mobile-first) class, so stacking is the
    // default layout applied at any width below the `md:flex-row` override --
    // i.e. below the tablet-width breakpoint, panels are always stacked.
    expect(shell?.className).toContain("flex-col");
    // Stacked panels rely on natural document flow (no fixed/absolute
    // positioning), so none of them can clip or overflow their container.
    for (const testId of ["folder-panel", "graph-view", "chat-panel"]) {
      const panel = screen.getByTestId(testId);
      expect(panel.className).not.toMatch(/absolute|fixed/);
    }
  });

  it("keeps the graph view at a usable size at both breakpoints", () => {
    /**
     * Given the app shell is rendered first at desktop width, then at tablet width,
     * when the viewport width changes,
     * then the graph view's rendered dimensions stay above a defined minimum usable size.
     *
     * Source: Feature: Three-Panel Responsive Layout — criterion 3
     */
    render(<App />);

    const graphView = screen.getByTestId("graph-view");
    // The min-height floor class is unprefixed, so it applies unconditionally
    // at every breakpoint -- the graph view can never render shorter than this,
    // whether panels are stacked (tablet-width and below) or in a row (desktop).
    expect(graphView.className).toContain("min-h-[320px]");
  });
});
