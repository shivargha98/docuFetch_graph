/**
 * Minimal type declarations for the `d3-force-3d` package (no bundled types,
 * no @types package): only the positional-force constructors GraphView uses
 * to compact the layout. Each returns a d3 force function object whose
 * `strength` setter returns the force itself (d3's fluent convention).
 */
declare module "d3-force-3d" {
  export interface PositionalForce {
    (alpha: number): void;
    strength(strength: number): PositionalForce;
  }
  export function forceX(x?: number): PositionalForce;
  export function forceY(y?: number): PositionalForce;
  export function forceZ(z?: number): PositionalForce;
}
