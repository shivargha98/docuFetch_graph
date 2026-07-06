/**
 * Unit tests for the pure relation-type-to-edge-style mapping utility used by
 * the 3D graph view to visually distinguish typed edges.
 * Source: Feature: 3D Graph Rendering & Initial Load (docs/frontend/features.md), Issue 6.
 */
import { describe, it, expect } from "vitest";
import { relationTypeToEdgeStyle } from "../../src/lib/edgeStyles";

describe("relationTypeToEdgeStyle", () => {
  it("maps each relation-type label to a distinct edge style", () => {
    /**
     * Given a set of edges with different relation-type labels
     * (e.g. is_a, depends_on, part_of, a freeform verb phrase),
     * when the relation-to-style mapping function is called for each,
     * then each relation type resolves to a distinct, defined style/label —
     * no two distinct relation types silently collapse to the same style.
     *
     * Source: Feature: 3D Graph Rendering & Initial Load — criterion 2
     */
    const relations = ["is_a", "depends_on", "part_of", "orbits gravitationally around"];
    const styles = relations.map(relationTypeToEdgeStyle);

    styles.forEach((style) => {
      expect(style.color).toBeTruthy();
      expect(style.particleColor).toBeTruthy();
    });

    for (let i = 0; i < styles.length; i++) {
      for (let j = i + 1; j < styles.length; j++) {
        expect(styles[i]).not.toEqual(styles[j]);
      }
    }
  });

  it("resolves an unrecognized/freeform relation label to a valid fallback style", () => {
    /**
     * Given a relation-type label not in the known set (a freeform verb phrase),
     * when the mapping function is called,
     * then it returns a valid fallback style rather than throwing.
     *
     * Source: Feature: 3D Graph Rendering & Initial Load — criterion 2
     */
    expect(() => relationTypeToEdgeStyle("orbits gravitationally around")).not.toThrow();

    const style = relationTypeToEdgeStyle("orbits gravitationally around");
    expect(style.color).toBeTruthy();
    expect(style.particleColor).toBeTruthy();
    expect(style.width).toBeGreaterThan(0);
    expect(style.particles).toBeGreaterThanOrEqual(0);
    expect(style.particleSpeed).toBeGreaterThanOrEqual(0);

    // Deterministic: the same unrecognized label always resolves to the same style.
    expect(relationTypeToEdgeStyle("orbits gravitationally around")).toEqual(style);

    // Never throws for an empty string either.
    expect(() => relationTypeToEdgeStyle("")).not.toThrow();
  });
});
