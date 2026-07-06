/**
 * Unit tests for NodeDetailOverlay, the floating HUD-style card shown when a
 * concept node is clicked.
 * Covers: rendering node detail content, and dismiss behavior.
 * Cross-panel interaction (linking to another node, drift-free anchoring while
 * orbiting) is covered in tests/integration/NodeDetailOverlayInteraction.test.tsx.
 * Source: Feature: Node Click HUD Detail Overlay (docs/frontend/features.md), Issue 8.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { NodeDetailOverlay } from "../../src/components/graph/NodeDetailOverlay";
import type { GraphNode } from "../../src/state/types";

afterEach(() => {
  cleanup();
});

const node: GraphNode = {
  id: "n1",
  name: "Alpha",
  description: "The first concept.",
  source_files: ["docs/alpha.md", "docs/alpha-notes.md"],
};

const linkedConcepts = [
  { id: "n2", name: "Beta" },
  { id: "n3", name: "Gamma" },
];

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
    const onSelectLinked = vi.fn();
    render(
      <NodeDetailOverlay
        node={node}
        linkedConcepts={linkedConcepts}
        position={{ x: 100, y: 100 }}
        onSelectLinked={onSelectLinked}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("The first concept.")).toBeInTheDocument();
    expect(screen.getByText("docs/alpha.md")).toBeInTheDocument();
    expect(screen.getByText("docs/alpha-notes.md")).toBeInTheDocument();

    const betaLink = screen.getByRole("button", { name: "Beta" });
    expect(betaLink).toBeInTheDocument();
    fireEvent.click(betaLink);
    expect(onSelectLinked).toHaveBeenCalledWith("n2");
  });

  it("dismisses when the dismiss trigger fires", () => {
    /**
     * Given the overlay is open for a node,
     * when an outside-click (or re-click on the same node) event fires,
     * then the overlay is no longer rendered.
     *
     * Source: Feature: Node Click HUD Detail Overlay — criterion 4
     */
    function Harness() {
      const [open, setOpen] = useState(true);
      if (!open) return null;
      return (
        <NodeDetailOverlay
          node={node}
          linkedConcepts={linkedConcepts}
          position={{ x: 100, y: 100 }}
          onSelectLinked={() => {}}
          onDismiss={() => setOpen(false)}
        />
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("node-detail-overlay")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("node-overlay-backdrop"));
    expect(screen.queryByTestId("node-detail-overlay")).not.toBeInTheDocument();
  });
});
