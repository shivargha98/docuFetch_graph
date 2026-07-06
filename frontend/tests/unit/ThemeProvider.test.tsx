/**
 * Unit tests for ThemeProvider.
 * Covers: default application of the dark neon/glow theme, and the absence of
 * any light-theme styling or toggle control.
 * Source: Feature: Dark Neon/Glow Theme System (docs/frontend/features.md), Issue 1.
 *
 * Caveat: exact color/design token values are not fixed by the PRD (deferred to an
 * implementation-time design pass) — these tests assert theme *application*, not
 * specific palette values. There is no dedicated `ThemeProvider` component in this
 * app (the theme is dark-only and baked into base CSS tokens, per the brief's
 * instruction not to build a `dark:` variant/toggle system) — these tests instead
 * exercise the rendered `App` shell as the thing that must always carry the dark
 * theme and never expose a toggle.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import App from "../../src/App";

afterEach(() => {
  cleanup();
});

describe("ThemeProvider", () => {
  it("applies the dark neon/glow theme by default with no light-theme styles present", () => {
    /**
     * Given the app is rendered with no theme preference configured,
     * when any themed surface (panel, button, input) is inspected,
     * then it carries the dark neon/glow theme's class/token set and no
     * light-theme class/token set is present anywhere.
     *
     * Source: Feature: Dark Neon/Glow Theme System — criterion 1
     */
    render(<App />);

    const folderPanel = screen.getByTestId("folder-panel");
    // Themed surfaces use the shared `glass-panel` class (dark glass/glow tokens).
    expect(folderPanel.className).toContain("glass-panel");
    // No light-theme marker class is ever applied anywhere in the tree.
    expect(document.body.innerHTML).not.toMatch(/light-theme|theme-light/);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("renders no theme-toggle control anywhere in the component tree", () => {
    /**
     * Given the full app shell is rendered,
     * when the rendered tree is queried for a theme-toggle control,
     * then no element matching a theme-toggle role/label is found.
     *
     * Source: Feature: Dark Neon/Glow Theme System — criterion 2
     */
    render(<App />);

    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByLabelText(/theme/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /dark mode|light mode|toggle theme/i })).toBeNull();
  });
});
