/**
 * Unit tests for NodeDetailOverlay, the floating HUD-style card shown when a
 * concept node is clicked.
 * Covers: rendering node detail content, and dismiss behavior.
 * Cross-panel interaction (linking to another node, drift-free anchoring while
 * orbiting) is covered in tests/integration/NodeDetailOverlayInteraction.test.tsx.
 * Source: Feature: Node Click HUD Detail Overlay (docs/frontend/features.md), Issue 8.
 */
import { describe, it, expect } from "vitest";

describe("NodeDetailOverlay", () => {
  it("renders the concept's description, source files, and linked concepts when given node data", () => {
    /**
     * Given node data including a description, a list of source files, and a
     * list of linked concepts,
     * when the overlay renders for that node,
     * then the description is visible, each source file is listed, and each
     * linked concept is rendered as a clickable link.
     *
     * Source: Feature: Node Click HUD Detail Overlay — criterion 1
     */
    throw new Error("Not implemented");
  });

  it("dismisses when the dismiss trigger fires", () => {
    /**
     * Given the overlay is open for a node,
     * when an outside-click (or re-click on the same node) event fires,
     * then the overlay is no longer rendered.
     *
     * Source: Feature: Node Click HUD Detail Overlay — criterion 4
     */
    throw new Error("Not implemented");
  });
});
