/**
 * Integration tests for NodeDetailOverlay's interaction with the graph: linking
 * to another concept, and staying anchored to its node without drift while the
 * camera orbits/zooms. Pure rendering of the overlay's own content is covered
 * in tests/unit/NodeDetailOverlay.test.tsx.
 * Source: Feature: Node Click HUD Detail Overlay (docs/frontend/features.md), Issue 8.
 */
import { describe, it, expect } from "vitest";

describe("NodeDetailOverlayInteraction", () => {
  it("highlights/selects the linked concept in the graph when its link is clicked inside the overlay", () => {
    /**
     * Given an open overlay for a node with at least one linked concept,
     * when a linked-concept link is clicked,
     * then the corresponding node in the graph becomes highlighted/selected.
     *
     * Source: Feature: Node Click HUD Detail Overlay — criterion 2
     */
    throw new Error("Not implemented");
  });

  it("keeps the overlay anchored near its node without drift as the camera orbits/zooms", () => {
    /**
     * Given an open overlay anchored to a node at a known 3D position,
     * when the camera's orbit/zoom state changes (mocked reprojection input),
     * then the overlay's computed 2D screen position updates to match the
     * node's reprojected position each time the camera state changes.
     *
     * Source: Feature: Node Click HUD Detail Overlay — criterion 3
     *
     * Note: this test uses a mocked camera-state/reprojection input rather than
     * a real three.js/WebGL render loop — see docs/frontend/tests.md's Gaps
     * section for why a true rendering-accuracy check was not added here.
     */
    throw new Error("Not implemented");
  });
});
