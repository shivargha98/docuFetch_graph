# Graph Visualization: Settle-then-Freeze, Compact Layout, Visible Labels — Design

**Date:** 2026-07-09
**Status:** Approved by user (option A + compactness requirement)
**Source:** User video (issues_screenshots/Recording 2026-07-09 213147.mp4): the constellation drifts continuously (physics re-heats keep the d3 simulation alive indefinitely) and disconnected clusters repel each other far apart; nodes are anonymous dots requiring per-node hover. Requirement: futuristic but easy to read, compact, and the scene must never move on its own — 3D retained.

## 1. Stillness as a guarantee: settle-then-freeze

`onEngineStop` (fires when the simulation cools) pins every node at its settled position (`fx/fy/fz = x/y/z`). Pinned nodes are immovable to d3 — no future re-heat, from any source, can move them. During ingestion, newly-added nodes are unpinned until the next cool-down, so they drift briefly into place around the frozen constellation, then freeze too. A folder switch/reset creates fresh unpinned node objects, so a new graph lays out normally before freezing. No camera motion anywhere (unchanged).

## 2. Compactness

Three force changes (applied once via `fgRef.d3Force`):
- charge (repulsion) strength: default −30 → **−12**
- link distance: default 30 → **22**
- new gentle centering forces `forceX(0)/forceY(0)/forceZ(0)` at strength **0.08** (from `d3-force-3d`, already installed as a transitive dep; added to package.json for explicitness — no install needed) — bounds disconnected clusters into one compact 3D constellation instead of letting mutual repulsion fling them apart.

## 3. Readability: always-visible name labels

New `nodeLabel.ts`: renders each node's name to a canvas texture → `THREE.Sprite` positioned under the glow (same canvas-texture technique as nodeGlow; no new rendering deps). Labels shrink naturally with distance (sizeAttenuation), so far clusters stay clean and nearby nodes are readable without hovering. Names over 24 chars are ellipsized (hover tooltip still shows the full name). `nodeThreeObject` becomes a GraphView wrapper: glow group + label sprite (nodeGlow.ts itself untouched). Returns null under jsdom (no canvas 2D context) — guarded.

## 4. Kept / out of scope

Materialize pop-in for new nodes kept (local, brief). Hover tooltip, traversal highlights, node HUD, zoom buttons, fog 0.0005 — unchanged. Camera stays fully manual.

## Testing

Imperative WebGL layer (forces, pinning, sprites) is untestable in jsdom per suite convention — verified by attenuation/physics reasoning + user's real browser. Existing GraphView-mounting tests must stay green; `tsc` needs a minimal `d3-force-3d` module declaration.
