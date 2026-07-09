/**
 * Raw hex color constants for the concept-graph canvas scene, mirroring the
 * app's `--color-void` / `--color-ion` / `--color-synapse` design tokens
 * defined in src/index.css. Canvas 2D fill/stroke APIs need raw color values
 * (not CSS custom properties), so the same hexes are re-declared here rather
 * than read from the stylesheet at runtime.
 */

/** Deep indigo-black scene background, matching `--color-void`. */
export const VOID = "#070812";

/** Primary neon accent (cyan), matching `--color-ion`. Used for node glow and structural edges. */
export const ION = "#6ee7f9";

/** Secondary neon accent (violet), matching `--color-synapse`. Used for causal/dependency edges. */
export const SYNAPSE = "#b389ff";
