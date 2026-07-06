### Status
COMPLETE

### What I Built

**New files (all under owned paths):**
- `src/components/graph/GraphView.tsx` (119 lines, full rewrite of the Round-1 placeholder) — the real 3D scene: fetches via `useGraphData`, renders `react-force-graph-3d`, wires node/edge styling, camera ref, ResizeObserver-based sizing, fog atmosphere, empty-state overlay, and a WebGL error boundary.
- `src/components/graph/GraphSceneErrorBoundary.tsx` (35 lines) — class-component error boundary; catches the real `ForceGraph3D`'s synchronous WebGL-context-creation failure and swaps in a themed fallback.
- `src/components/graph/nodeGlow.ts` (73 lines) — builds the shared glow geometry/material/texture and returns a fresh `THREE.Group` (core sphere + additive-blended halo sprite) per node.
- `src/components/graph/sceneColors.ts` (16 lines) — raw hex constants (`VOID`, `ION`, `SYNAPSE`) mirroring `src/index.css` tokens, since three.js needs raw values.
- `src/hooks/useGraphData.ts` (40 lines) — fetches `/api/graph`, dispatches `SET_GRAPH`, refetches on `folderPath` change.
- `src/lib/edgeStyles.ts` (61 lines) — pure `relationTypeToEdgeStyle(relation: string): EdgeStyle` mapping.

**Tests (copied from `docs/frontend/tests/` and implemented):**
- `tests/unit/GraphEdgeStyling.test.ts` (58 lines, 2 tests)
- `tests/integration/useGraphData.test.tsx` (133 lines, 3 tests)

No frozen files were touched (verified: no edits to `package.json`, `vite.config.ts`, `tsconfig*`, `src/index.css`, `src/App.tsx`, `src/state/**`, `src/components/chat|folder|ui/**`, `tests/setup.ts`, or the existing `reducers`/`AppShell`/`ThemeProvider`/`CollapsiblePanel` tests).

### Design decisions (frontend-design skill, invoked before writing rendering/styling code)

Anchored to the existing token system (void `#070812`, ion `#6ee7f9`, synapse `#b389ff`) rather than introducing a new palette — the graph is the centerpiece this round, so the signature move is confined to *how* the existing duotone is used in 3D, not a new color language:

- **Nodes** — every concept node is a small unlit ion-colored core sphere (`MeshBasicMaterial`, so it reads as fully lit/bright with no scene lighting dependency) plus a larger sprite behind it using a radial-gradient canvas texture with `THREE.AdditiveBlending` — the classic no-postprocessing "fake bloom" trick. Geometry/material/texture are built once at module scope in `nodeGlow.ts` and reused per node (only the `Group` instance is per-node).
- **Edges** — a deterministic `relation -> style` map (`edgeStyles.ts`) with five hand-authored known relations plus one stable fallback:
  - `is_a` — ion, width 1.6, 0 particles (static taxonomic backbone, no flow implies no directional dependency)
  - `part_of` — ion, width 1, 1 slow particle (containment, gentle flow)
  - `depends_on` — synapse, width 1.3, 2 particles (dependency direction is visually "active")
  - `causes` — synapse, width 1.4, 3 particles (strongest causal flow)
  - `related_to` — a periwinkle blend (`#9b9ee0`) between ion/synapse, 1 particle, for generic named relations
  - fallback (any unrecognized/freeform label) — a dim slate (`#5f6a8c`), 1 particle at low speed, deliberately the quietest treatment so unclassified relations don't visually compete with the known categories
  Distinctness is achieved via the *combination* of color+width+particle-count+speed, not color alone, so the app's existing "duotone-only, no rainbow of accents" rule (per foundation memory) still holds even with 6 distinct styles.
- **Scene/atmosphere** — `backgroundColor` pinned to `VOID`; a `THREE.FogExp2` (density 0.018, color = void) added via the `fgRef.scene()` imperative accessor so distant nodes recede rather than popping against a flat backdrop. `showNavInfo` disabled (the library's default on-screen control hint text didn't fit the aesthetic; camera controls still work identically). No starfield/particle backdrop, no bloom/postprocessing library, no new dependencies — deliberately restrained everywhere except the node/edge treatment, per the skill's "spend boldness in one place" principle.
- **Labels/hover** — `nodeLabel` returns the node's plain name via ForceGraph3D's built-in floating tooltip (backed by the `float-tooltip` package's `.float-tooltip-kap` DOM class, confirmed by reading `node_modules`). I did not add custom CSS theming for that tooltip class — it's an internal implementation detail of a third-party sub-dependency, version-coupled and outside my owned file set (`src/index.css` is frozen), so restyling it felt too fragile for the payoff; flagging as a possible small enhancement for a later round if desired.
- **Camera** — no changes to `controlType`/`enableNavigationControls`; verified (via `node_modules/three-render-objects`) that the library's default `controlType: 'trackball'` is active whenever navigation controls aren't explicitly disabled, giving rotate/zoom/pan out of the box.

### GraphView extension points for Rounds 3-4

- **`fgRef`** — `useRef<ForceGraphMethods<SceneNode, SceneLink> | undefined>(undefined)`, passed as `ref` to `<ForceGraph3D>`. Exposes `cameraPosition()`, `zoomToFit()`, `emitParticle()`, `scene()`, `camera()`, `controls()`, etc. Round 3's camera-follow should read/write through this ref (guard with `if (!fgRef.current) return` the same way the fog effect does, since the ref is `undefined` until the underlying instance mounts — and stays `undefined` forever under the WebGL-less test/error-boundary path).
- **`graphData`** — single `useMemo` combining `state.nodes`/`state.edges`; Round 3/4 highlight/fade-in work should add new accessor props (e.g. `nodeColor`, `nodeOpacity`) that read `state.highlightedNodeIds`/`state.highlightedEdgeIds`/`state.selectedNodeId` from the same `useGraphState()` call already at the top of the component, rather than re-fetching or restructuring `<ForceGraph3D>`.
- **`handleNodeClick(_node: SceneNode)`** — currently a literal no-op, wired to `onNodeClick`. Round 4 (Issue 8) should replace the body to dispatch a `selectedNodeId` update and leave the signature/wiring untouched.
- **`buildNodeGlowObject`** — currently ignores its node argument (uniform styling); if fade-in (Issue 7) needs per-node animation state, extend this function's signature (it's the sole `nodeThreeObject` accessor) rather than adding a second one.

### ForceGraph3D jsdom mock pattern (for Rounds 3-4 to reuse)

```ts
vi.mock("react-force-graph-3d", () => ({
  default: (props: CapturedProps) => {
    capturedProps = props;
    return null;
  },
}));
```
Mock the **default export** as a plain function component that records whatever props `GraphView` passes it (`graphData`, `linkColor`, `linkWidth`, etc.) into a module-level `let capturedProps` variable, reset in `afterEach`. Then assert either against `capturedProps.graphData` directly, or call the recorded accessor functions (`capturedProps.linkColor(edge)`) with sample data and compare to the pure `edgeStyles` function's output. `render()` from RTL + `waitFor()` handles the async fetch→dispatch→re-render cycle; no `act()` wrapping needed manually.

**Important gotcha discovered:** this mock is *necessary but not sufficient*. Any test that mounts the real `<App>` (which always renders the real, un-mocked `GraphView`/`ForceGraph3D`) will trigger a real `WebGLRenderer` construction attempt, which throws synchronously in jsdom (`THREE.WebGLRenderer: Error creating WebGL context.`) during the commit phase. This broke the frozen `AppShell.test.tsx` and `ThemeProvider.test.tsx` the moment I replaced the placeholder — see `GraphSceneErrorBoundary` below.

### useGraphData / edgeStyles public APIs (verbatim)

```ts
// src/hooks/useGraphData.ts
export function useGraphData(): void
```
Call once from `GraphView`. No return value — consumers read graph state via `useGraphState()`. Fetches `/api/graph` on mount and on every `folderPath` change (from `useIngestionState()`); dispatches `SET_GRAPH`. Fetch failures are swallowed (`.catch(() => {})`) — see deviations below.

```ts
// src/lib/edgeStyles.ts
export interface EdgeStyle {
  color: string;
  particleColor: string;
  width: number;
  particles: number;
  particleSpeed: number;
}
export function relationTypeToEdgeStyle(relation: string): EdgeStyle
```
Pure, case/whitespace-insensitive lookup (`is_a`, `part_of`, `depends_on`, `causes`, `related_to` known; anything else → one stable fallback). Never throws.

### Test Results

`cd /workspace/frontend && npx vitest run`:
```
 Test Files  11 passed (11)
      Tests  34 passed (34)
```
- `tests/unit/GraphEdgeStyling.test.ts` — 2/2 PASS
- `tests/integration/useGraphData.test.tsx` — 3/3 PASS
- All other test files (owned by parallel workers or frozen from Round 1: `reducers`, `AppShell`, `ThemeProvider`, `CollapsiblePanel`, `FolderPathInput`, `useFolderConfig`) — still passing (29/29 combined).

`npx tsc -b` — clean, no output.

`npm run build` — PASS:
```
dist/index.html                     0.80 kB │ gzip:   0.43 kB
dist/assets/index-*.css            13.53 kB │ gzip:   3.57 kB
dist/assets/index-*.js           1,627.77 kB │ gzip: 447.97 kB
✓ built in 16.89s
```
(Chunk-size warning only, from bundling `three` — expected, not an error; no code-splitting was requested by the brief so I left it as a single bundle.)

### What the Orchestrator Should Know

1. **Discovered gotcha, not in the brief:** mounting the real (un-mocked) `GraphView` anywhere in jsdom — which the *frozen* `AppShell.test.tsx` and `ThemeProvider.test.tsx` do, since they render the full `<App>` — throws synchronously (`WebGLRenderer: Error creating WebGL context`) and crashed both those test files the moment I replaced the Round-1 placeholder. Fixed by adding `GraphSceneErrorBoundary` (`src/components/graph/GraphSceneErrorBoundary.tsx`), a class-component error boundary wrapping `<ForceGraph3D>` that swaps in a themed fallback (`"3D graph rendering isn't available in this browser"`) on any mount-time error. This is a genuine environment-compat fix (not gold-plating): it also gracefully degrades in the rare real browser without WebGL. I could not touch the frozen test files, so this had to be solved entirely within my owned files.
2. **Fetch-failure swallowing:** `useGraphData` originally let a failed `fetch("/api/graph")` reject unhandled. That also broke the same two frozen tests (unhandled promise rejection reported as a test failure) because they mount `GraphView` without stubbing `fetch`. Added a trailing `.catch(() => {})` — no error-state UI is implemented or requested this round (acceptance criteria only cover success and empty-graph paths), so this is a minimal swallow, not a feature. Flagging in case a later round wants a real error-state UI for failed graph loads.
3. **Assumption:** `useGraphData` fetches unconditionally on mount and again on every `folderPath` change (including the initial `null` → first-folder transition), rather than skipping the fetch while `folderPath` is `null`. This is the simplest standard "fetch on mount + refetch on dependency change" pattern and keeps the hook trivial; flag if the orchestrator intended the fetch to be gated on a folder actually being configured first.
4. **`float-tooltip`'s hover-label DOM** (the `.float-tooltip-kap` class, confirmed in `node_modules/float-tooltip`) is unstyled/library-default this round — theming it would touch `src/index.css` (frozen) or require an in-JS style injection I judged too fragile/version-coupled to add without being asked. Noted as a possible small polish item for a later round, not done.
5. No new dependencies were added — glow/atmosphere effects use only `three` primitives and `react-force-graph-3d`'s existing accessor props, per the brief's constraint.

### What the Next Worker Needs

- **Round 3 (traversal highlight + camera-follow, Issue 10):** read/write graph state's `highlightedNodeIds`/`highlightedEdgeIds` (already in `GraphState`) and add corresponding `nodeColor`/`linkColor` (or opacity) overrides to the existing accessor props in `GraphView.tsx`; use `fgRef.current?.cameraPosition(...)` for camera-follow. Don't restructure the `<ForceGraph3D>` element — extend the accessor functions in place.
- **Round 4 (node fade-in, Issue 7 + HUD overlay, Issue 8):** `handleNodeClick` in `GraphView.tsx` is the wiring point for opening the HUD (dispatch a `selectedNodeId` change via `useGraphState().dispatch`); `buildNodeGlowObject` in `nodeGlow.ts` is the single place per-node visual state (e.g. fade-in opacity/scale) would need to read from.
- Both rounds should reuse the `vi.mock("react-force-graph-3d", ...)` stand-in pattern documented above for their own GraphView-touching tests.

### Blockers

None. `worker-foundation-report.md` was read and all referenced state types/hooks/tokens existed and matched exactly as documented. No dependency files were missing.
