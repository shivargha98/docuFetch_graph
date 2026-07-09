/**
 * Unit tests for the AppShell component.
 * Covers: the full-window graph centerpiece and the two floating docks
 * (FolderDock top-left, ChatDock bottom-right) that replaced the old
 * three-panel layout.
 * Source: Feature: Three-Panel Responsive Layout (docs/frontend/features.md),
 * Issue 1 — superseded by docs/superpowers/specs/2026-07-09-chat-dock-design.md
 * and docs/superpowers/specs/2026-07-09-folder-dock-design.md.
 *
 * jsdom does not run a real layout/CSS engine, so these tests can't assert on
 * computed pixel widths. Instead they assert on the Tailwind utility classes
 * that *encode* the contract: the graph carries `flex-1` inside the shell
 * container (it owns the whole viewport) plus a `min-h-[320px]` usable-size
 * floor, and both docks carry `fixed` positioning so they float over the
 * graph instead of occupying layout space.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import App from "../../src/App";

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("renders the graph as the full-window centerpiece with both docks floating over it", () => {
    /**
     * Given the app shell is rendered,
     * then the graph view is the shell's only in-flow panel (flex-1, so it
     * fills the viewport), and the folder + chat docks are fixed overlays
     * outside the shell's flow.
     */
    render(<App />);

    const graphView = screen.getByTestId("graph-view");
    const folderDock = screen.getByTestId("folder-dock");
    const chatDock = screen.getByTestId("chat-dock");
    expect(graphView).toBeInTheDocument();
    expect(folderDock).toBeInTheDocument();
    expect(chatDock).toBeInTheDocument();

    // The graph owns the shell: it grows to fill it, and neither dock is a
    // flow sibling inside it.
    expect(graphView.className).toContain("flex-1");
    const shell = graphView.parentElement;
    expect(shell).not.toContainElement(folderDock);
    expect(shell).not.toContainElement(chatDock);

    // Both docks float: folder pinned top-left, chat pinned bottom-right.
    expect(folderDock.className).toContain("fixed");
    expect(folderDock.className).toContain("top-4");
    expect(folderDock.className).toContain("left-4");
    expect(chatDock.className).toContain("fixed");
    expect(chatDock.className).toContain("bottom-0");
  });

  it("keeps the graph view at a usable size", () => {
    /**
     * Given the app shell is rendered,
     * then the graph view carries its unconditional min-height floor so it
     * never collapses below a usable size at any viewport.
     */
    render(<App />);

    const graphView = screen.getByTestId("graph-view");
    expect(graphView.className).toContain("min-h-[320px]");
  });
});
