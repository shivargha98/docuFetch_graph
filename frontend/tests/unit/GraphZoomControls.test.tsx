/**
 * Tests for the graph viewport's manual zoom controls: the pure camera-dolly
 * math (zoomedCameraPosition) and the +/− buttons rendered in the viewport's
 * top-right corner. The real camera move is imperative WebGL (untestable in
 * jsdom — fgRef stays undefined under the suite's standard force-graph mock),
 * so the math is exported pure, same pattern as reprojectNodeToScreen.
 * Source: user request 2026-07-09 (manual zoom instead of continuous auto-fit).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { mockFetch, resetAllMocks } from "../setup";
import { AppProviders } from "../../src/state/providers";
import { GraphView, zoomedCameraPosition } from "../../src/components/graph/GraphView";

vi.mock("react-force-graph-3d", () => ({
  default: () => null,
}));

afterEach(() => {
  resetAllMocks();
  cleanup();
});

describe("zoomedCameraPosition", () => {
  it("scales the camera's offset from the target by the factor (in and out)", () => {
    /**
     * Given a camera at (0, 0, 100) orbiting a target at the origin,
     * then factor 0.5 halves the distance and factor 2 doubles it, along the
     * same view axis.
     */
    const target = { x: 0, y: 0, z: 0 };
    expect(zoomedCameraPosition({ x: 0, y: 0, z: 100 }, target, 0.5)).toEqual({ x: 0, y: 0, z: 50 });
    expect(zoomedCameraPosition({ x: 0, y: 0, z: 100 }, target, 2)).toEqual({ x: 0, y: 0, z: 200 });
  });

  it("dollies relative to a non-origin target, preserving the view direction", () => {
    /**
     * Given a camera offset (30, 0, 40) from a target at (10, 20, 30),
     * when zooming in by 0.5,
     * then the offset halves component-wise while the target stays fixed.
     */
    const target = { x: 10, y: 20, z: 30 };
    expect(zoomedCameraPosition({ x: 40, y: 20, z: 70 }, target, 0.5)).toEqual({
      x: 25,
      y: 20,
      z: 50,
    });
  });
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
