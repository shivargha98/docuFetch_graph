# Graph View: 3D → 2D (canvas) — Design

**Date:** 2026-07-10
**Status:** User-directed ("Make it a 2D graph, 3D is rendering very slowly on my laptop")

## Approach

Swap `react-force-graph-3d` (WebGL/three.js) for `react-force-graph-2d` (pure canvas, no natives) in place: `GraphView.tsx` keeps its name, test ids, props, and every behavior decision made this cycle — settle-then-freeze stillness, compact forces, hover-only labels, no auto camera motion, +/− zoom buttons, generating banner, node HUD, traversal highlights.

## Mapping

- **Node rendering:** `nodeCanvasObject` draws the ion glow (radial-gradient halo + core disc) directly — `nodeGlow.ts`/`nodeLabel.ts`/three.js sprites deleted. Hover label = canvas text under the hovered node only (hoveredNodeIdRef; the lib repaints on hover). Traversal-highlight halos = synapse rings drawn in the same pass (latest hop brighter) — replaces the imperative sprite system. Materialize pop-in = radius scale via the existing fadeMap/easeOutBack. `nodePointerAreaPaint` paints a generous hitbox so small nodes hover easily.
- **Stillness/compactness:** identical — `onEngineStop` pins `fx/fy`; charge −12, link distance 22, `forceX/forceY(0).strength(0.08)` (no z). `d3-force-3d` stays (dimension-agnostic).
- **Camera:** starts at the lib default (zoom 1, centered on origin — the compact layout fits typical viewports); NO auto motion; zoom buttons use `fg.zoom(fg.zoom()×1.4, 300ms)`. `zoomedCameraPosition` (3D dolly math) deleted. `graphCameraControls.focusNode` → `centerAt(x, y, 800)`.
- **HUD reprojection:** `graph2ScreenCoords(x, y)` (no z); `reprojectNodeToScreen` simplified.
- **Fog:** gone (meaningless in 2D). `GraphSceneErrorBoundary` kept as a generic guard.
- **Edges:** same accessors (`linkColor/linkWidth/particles` all supported by the 2D build).

## Dependencies

`package.json`: + `react-force-graph-2d`, − `react-force-graph-3d`, − `three`. The user must run `npm install` on the Windows host (node_modules is host-owned); the container test copy gets its own install.

## Tests

- `vi.mock("react-force-graph-3d")` → `"react-force-graph-2d"` in the four GraphView-mounting test files (capture-props pattern unchanged).
- `NodeDetailOverlayInteraction`: reprojection tests drop the z coordinate.
- `GraphZoomControls`: dolly-math tests replaced (zoom is now a scalar); button-render test unchanged.
