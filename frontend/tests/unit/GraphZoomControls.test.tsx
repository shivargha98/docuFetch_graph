/**
 * Tests for the graph viewport's manual zoom controls: the +/− buttons
 * rendered in the viewport's top-right corner. The zoom itself is the 2D
 * library's scalar `fg.zoom()` (imperative canvas, untestable in jsdom —
 * fgRef stays undefined under the suite's standard force-graph mock).
 * Source: user request 2026-07-09 (manual zoom instead of continuous auto-fit).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { mockFetch, resetAllMocks } from "../setup";
import { AppProviders } from "../../src/state/providers";
import { GraphView } from "../../src/components/graph/GraphView";

vi.mock("react-force-graph-2d", () => ({
  default: () => null,
}));

afterEach(() => {
  resetAllMocks();
  cleanup();
});

describe("graph zoom buttons", () => {
  it("renders zoom-in and zoom-out buttons in the graph viewport", async () => {
    /**
     * Given a mounted GraphView,
     * then the +/− zoom controls are present with accessible labels.
     */
    mockFetch({ graphRead: { status: 200, body: { nodes: [], edges: [] } } });
    render(
      <AppProviders>
        <GraphView />
      </AppProviders>
    );

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
  });
});
