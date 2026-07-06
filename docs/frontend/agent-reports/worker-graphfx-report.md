### Status
COMPLETE

### What I Built

**New files**
- `src/hooks/useNodeFadeIn.ts` (99 lines) — polls `GET /api/graph` every 2500ms (same cadence as `useIngestionStatus`), diffs the response against live graph state, and dispatches `ADD_NODE` for each new node id and `ADD_EDGES` (new, additive action) for any newly-discovered edges. Never dispatches `SET_GRAPH`. Returns a `React.RefObject<Map<string, number>>` (node id -> first-seen `Date.now()` timestamp) that GraphView reads once per rendered frame to drive the pop-in animation; entries are removed via `setTimeout` once `FADE_DURATION_MS` (650ms, exported) elapses.
- `src/components/graph/NodeDetailOverlay.tsx` (109 lines) — the HUD detail card: ion corner-bracket frame, a top ion-to-synapse "energy bar," mono uppercase telemetry-style section labels (`:: Source files`, `:: Linked concepts`), angular (clip-path) linked-concept chips in synapse. Presentational only — all data/callbacks (`node`, `linkedConcepts`, `position`, `onSelectLinked`, `onDismiss`) are props from GraphView.

**Extended (existing files)**
- `src/components/graph/GraphView.tsx` (119 → 303 → 375 lines) — added: `useNodeFadeIn()` call; `dispatch` destructured from `useGraphState()`; `easeOutBack` and exported `reprojectNodeToScreen` pure helpers; `selectedNode`/`linkedConcepts` derived via `useMemo`; `overlayScreenPos` state reset on selection change; `handleEngineTick` (wired to the new `onEngineTick` prop) that recomputes the selected node's screen position every frame via `reprojectNodeToScreen`; `handleNodeClick` now dispatches `SELECT_NODE` (toggling to `null` on re-click of the same node) instead of being a no-op; `handleNodePositionUpdate` (wired to the new `nodePositionUpdate` prop) scales a still-fading node's glow `Group` along `easeOutBack` from the fade map, returning `false` so default position assignment still applies; `<NodeDetailOverlay>` rendered as a sibling of `GraphSceneErrorBoundary` (not inside it, since it's plain DOM/CSS with no WebGL dependency). Nothing else in the file was restructured — `<ForceGraph3D>`'s existing prop list, `GraphSceneErrorBoundary`, and Round 3's highlight-sprite system are untouched aside from adding two new props (`nodePositionUpdate`, `onEngineTick`) alongside the existing ones.
- `src/state/types.ts` — additive only, `GraphAction` gained two variants (exact diff below).
- `src/state/graphReducer.ts` — additive only, two new `switch` cases (exact diff below); `ADD_NODE`/`SET_GRAPH`/`RESET_GRAPH`/`HIGHLIGHT_NODE`/`CLEAR_HIGHLIGHT` bodies byte-for-byte unchanged.

**Tests** (written directly into `frontend/tests/` at the paths the brief specified; the `docs/frontend/tests/` stubs were read for exact scenario wording, then implemented fresh rather than copied verbatim since the stubs' `throw new Error("Not implemented")` bodies had no runnable scaffolding to preserve beyond the `describe`/`it` names, which I kept identical)
- `tests/unit/NodeDetailOverlay.test.tsx` (2 tests)
- `tests/integration/NodeDetailOverlayInteraction.test.tsx` (2 tests)
- `tests/integration/useNodeFadeIn.test.tsx` (2 tests)

### Additive diffs (verbatim)

```ts
// state/types.ts — GraphAction, two new variants appended
| { type: "ADD_EDGES"; edges: GraphEdge[] }
| { type: "SELECT_NODE"; nodeId: string | null };
```

```ts
// state/graphReducer.ts — new cases
case "ADD_EDGES":
  return { ...state, edges: [...state.edges, ...action.edges] };
case "SELECT_NODE":
  return { ...state, selectedNodeId: action.nodeId };
```

`reducers.test.ts` (frozen) does not exercise either new action — confirmed it still passes unmodified.

### Fade-in mechanism (Issue 7)

- **Polling cadence**: 2500ms, its own independent `setInterval`, not shared with `useIngestionStatus`'s timer (per the brief's instruction not to try to share timers across hook files).
- **"New" vs "settled"**: a node id is "new" (fading) for exactly `FADE_DURATION_MS` = 650ms after `useNodeFadeIn` first observes it in a poll response that wasn't already in graph state, tracked in `fadeMapRef` (a plain `Map`, not React state — no re-render is needed to drive it, since the actual animation is read directly by GraphView's `nodePositionUpdate` accessor on three.js's own render loop). After 650ms the entry is deleted and the node is "settled" (query returns `progress = 1`, i.e. full scale, permanently).
- **Visual**: because `nodeGlow.ts`'s core/halo materials are shared (module-level, frozen) across every node instance, per-node opacity isn't available — only `scale` is per-instance (each node gets its own `THREE.Group`). So the fade-in is a **scale-only "materialization" pop**: `obj.scale.setScalar(easeOutBack(progress))`, where `easeOutBack` overshoots past 1.0 before settling, so it reads as an energetic pop rather than a flat linear grow-in (this was the specific direction from the frontend-design skill invocation — see Design decisions below).
- **Per-frame hook chosen**: `nodePositionUpdate` (confirmed present on the installed `react-force-graph-3d`/`three-forcegraph` version via reading `node_modules/three-forcegraph/dist/three-forcegraph.mjs`) — called once per node per rendered frame by the underlying force-graph engine, receiving `(obj, coords, node)` where `obj` is exactly the `Group` instance `nodeThreeObject` returned for that node (confirmed by reading the library's `tickFrame`/`layoutTick` internals: `nodeThreeObjectExtend={false}` means `obj` itself, not `obj.children[0]`, is passed). I confirmed via the same source that the library auto-reheats the physics engine (`engineRunning = true`) on every `graphData` change, so `nodePositionUpdate` reliably keeps firing for a fresh window after each `ADD_NODE`/`ADD_EDGES` dispatch even if the simulation had already cooled down beforehand — this is what makes the per-frame scale animation actually run when a node is added mid-session, not just during initial warmup.
- **Existing nodes undisturbed**: `ADD_NODE` only appends (Round 1's reducer, untouched); `useNodeFadeIn` never dispatches `SET_GRAPH`. Verified explicitly in `useNodeFadeIn.test.tsx`'s second test via reference-equality (`result.current.graphState.nodes[0]` is `===` the pre-existing node object after a new node is added).

### Reprojection mechanism chosen (Issue 8)

`ForceGraphMethods.graph2ScreenCoords(x, y, z): Coords` — confirmed present directly on the installed `react-force-graph-3d` version's `ForceGraphMethods` interface (`node_modules/react-force-graph-3d/dist/react-force-graph-3d.d.ts`), so no separate `camera()` + manual `THREE.Vector3.project()` was needed. The per-frame update loop is `onEngineTick` (also confirmed present on `ForceGraphProps`, and confirmed via `three-forcegraph`'s source to fire every rendered frame regardless of whether the physics simulation itself is still "hot"). `reprojectNodeToScreen(fg, node)` is exported as a standalone pure function (no `GraphView` internals needed) so the "camera orbit/zoom changes the projection" behavior is testable by passing different mocked `{ graph2ScreenCoords: () => ({x,y,z}) }` objects, without mounting a real WebGL scene — this is exactly what `NodeDetailOverlayInteraction.test.tsx`'s second test does, per the brief's explicit instruction to use "a mocked camera-state/reprojection input" rather than a real render loop.

`overlayScreenPos` (React state) is recomputed on every `onEngineTick` call while a node is selected, and reset to `null` whenever the selection changes (so a freshly-opened overlay never briefly shows the previous node's stale position). When `overlayScreenPos` is `null` (not yet computed, or `fgRef.current` unavailable — e.g. every jsdom test, since the `vi.mock("react-force-graph-3d", ...)` pattern never invokes the `ref` callback), `NodeDetailOverlay` falls back to `left/top: 50%` (centered in the container) so the overlay still renders its content immediately on click rather than being invisible until the first tick.

### Node-selection vs traversal-highlight visual distinction

I added a **new, separate `SELECT_NODE` action** rather than reusing Round 3's `HIGHLIGHT_NODE`/`CLEAR_HIGHLIGHT` (which append to/clear an accumulating multi-node trail with brightness gradation — semantically "path visited so far during a live query"). A single user click selecting one node for detail inspection is a different concept (single target, not a trail, not tied to a query), so conflating the two would have made `CLEAR_HIGHLIGHT` (fired automatically when a traversal completes, per Round 3's `useTraversalSync`) accidentally dismiss an unrelated open HUD overlay, or vice versa. This is a real, intentional design choice, not an oversight.

**Deliberately left as a gap, flagged rather than silently decided**: `SELECT_NODE` only updates `state.selectedNodeId` (which the HUD overlay reads to know which node to show detail for) — I did **not** add a third visual marker (e.g. a new glow ring/sprite) around the selected node in the 3D scene itself, distinct from Round 3's highlight-sprite system. The acceptance criterion ("clicking a linked-concept link ... highlights/selects that concept in the graph") is satisfied via the HUD overlay itself re-anchoring to the newly-selected node (which is the only user-visible feedback), not via an additional in-scene highlight. Adding a third sprite/glow system alongside the frozen `nodeGlow.ts` glow and Round 3's traversal-highlight sprite felt like it would start stacking visual systems and materials for marginal benefit without being explicitly requested — flagging this so the orchestrator can decide if a distinct "selected" glow ring is wanted in a later round.

### Design decisions (frontend-design skill, invoked before writing HUD/fade-in styling code)

Per the skill's process, before writing any HUD/animation code I worked out a compact plan anchored strictly to the existing frozen tokens (void/glass/ion/synapse/muted, Space Grotesk/Inter/IBM Plex Mono, the existing glow-shadow utilities) — no new colors were introduced anywhere in this round:

- **Signature element**: ion corner brackets (four small absolutely-positioned "L" shapes, `border-l-2 border-t-2`/etc. per corner) framing the HUD card like a targeting-computer reticle, plus a single thin ion→synapse gradient bar capping the top edge — the one deliberate "spend boldness here" flourish for the whole overlay, matching the skill's "spend your boldness in one place" guidance. Everything else on the card (description text, source-file list) stays quiet/plain, so the reticle frame and top bar read as *the* HUD signature rather than one of several competing effects.
- **Telemetry-style section labels**: `:: Source files` / `:: Linked concepts` in uppercase, tracked-out, 10px monospace (IBM Plex Mono, the project's existing "system readout" face) rather than plain prose headings — reads as console/telemetry output rather than a generic card's section titles, consistent with `TraceBlock`'s existing mono/telemetry treatment from Round 3.
- **Linked-concept chips**: rendered with an angular `clip-path` (one slanted corner) rather than `rounded-full` pills — pills read as a generic bootstrap-y affordance; the slanted-corner "instrument panel button" shape reads as HUD-native and reuses the existing synapse accent + `shadow-glow-synapse` on hover, no new color.
- **Close control**: `[x]` in bracketed monospace rather than a plain icon button, echoing the same HUD-readout vocabulary as the corner brackets/labels.
- **Node pop-in**: scale-only (materials are shared/frozen, so no per-node opacity is available — see Fade-in mechanism above), using an `easeOutBack` curve so the node overshoots past full scale before settling, reading as an energetic "materialization" rather than a flat fade/grow. This was the specific resolution the skill invocation converged on for "how do you make an appearance feel futuristic when you can't touch opacity."
- Quality-floor items the skill calls out (responsive layout, visible focus, reduced motion) were already covered by existing project conventions I didn't need to re-solve: the overlay uses the existing `.glass-panel` class and Tailwind's default focus-visible ring is unaffected by any of my added classes; I did not add a `prefers-reduced-motion` guard around the scale animation specifically, since (unlike Round 3's CSS `animate-pulse`, which had a `motion-safe:` variant available for free) there's no equivalent lightweight three.js-side primitive and the brief didn't call this out as an explicit acceptance criterion — flagging as a possible small follow-up rather than adding new speculative logic un-requested.

### Test Results

`cd /workspace/frontend && npx vitest run` (run twice for certainty after a typecheck fix, both identical):
```
Test Files  22 passed (22)
      Tests  62 passed (62)
```
- `tests/unit/NodeDetailOverlay.test.tsx` — 2/2 PASS
- `tests/integration/NodeDetailOverlayInteraction.test.tsx` — 2/2 PASS
- `tests/integration/useNodeFadeIn.test.tsx` — 2/2 PASS
- All 19 pre-existing test files (Round 1-3, including `reducers.test.ts`, `AppShell.test.tsx`, `ThemeProvider.test.tsx`, `useTraversalSync.test.tsx`, `TraceBlock.test.tsx`, etc.) — still passing, 56/56, exactly matching the brief's stated Round 3 baseline (19 files/56 tests) plus my 3 new files/6 new tests = 22 files/62 tests. No flaky `[vitest-pool-runner]` timeout was observed in either run (expected, since I'm the sole worker this round — no concurrent worker process contention).
- The repeated `Not implemented: HTMLCanvasElement's getContext() method` console warnings are the same pre-existing benign jsdom-canvas warning from `nodeGlow.ts`/the highlight-sprite texture builder (both guard with `if (ctx)`), not a new issue and not a test failure.

`npx tsc -b` — clean (no output), after one fix: the first attempt failed with `TS2322` on `nodePositionUpdate`'s `node` parameter (typed as the local `SceneNode` alias, which is too narrow for the library's own generic `NodePositionUpdateFn` signature); fixed by typing that parameter as the library's bare `NodeObject` (already imported) instead, which is what the library's own type expects structurally.

`npm run build` — succeeded:
```
dist/index.html                     0.80 kB │ gzip:   0.43 kB
dist/assets/index-BCk1lW4o.css     20.24 kB │ gzip:   4.75 kB
dist/assets/index-DK-p9IKz.js   1,638.28 kB │ gzip: 451.11 kB
✓ built in 16.73s
```
(Same pre-existing >500kB chunk-size warning from `three`/`react-force-graph-3d`, not introduced by me, no code-splitting requested.)

### What the Orchestrator Should Know

1. **Test files were re-implemented from scratch rather than literally copied then edited**: the `docs/frontend/tests/` stub files for this round contained only `describe`/`it` blocks with `throw new Error("Not implemented")` bodies and no imports/mocks/harness scaffolding (unlike some earlier-round stubs), so there was nothing runnable to preserve beyond the exact test names/descriptions and the JSDoc criterion comments, which I kept verbatim. Functionally equivalent to "copy then implement," same end state.
2. **`useNodeFadeIn`'s edge-dedup key** is `${source}->${target}:${relation}` (not just endpoints) so two edges between the same pair of nodes with different relation labels are both considered distinct/addable — a minor robustness choice not explicitly spelled out in the brief, documented here as an assumption.
3. **Node-selection has no distinct in-scene visual** beyond the HUD overlay itself (see "Node-selection vs traversal-highlight visual distinction" above) — flagging explicitly as a "your call, document it" item per the brief's own wording, in case a later round wants a dedicated selection glow ring.
4. **No `prefers-reduced-motion` guard on the three.js pop-in scale animation** (see Design decisions) — the CSS-side `motion-safe:` trick Round 3 used isn't directly available for an imperative `THREE.Object3D.scale` mutation; not adding one was a judgment call to avoid unrequested speculative logic, flagged for visibility rather than silently decided.
5. **Unverified in a real browser** (same caveat every prior graph-touching round has flagged, since no headless-browser/screenshot tool exists in this sandbox): the actual visual quality of the `easeOutBack` pop-in animation and the HUD overlay's real-world drift-free anchoring while a user manually orbits/zooms the camera. Both are implemented exactly per the reprojection/animation mechanisms confirmed against the installed library's own source and covered by pure-function/mocked-input tests, but a manual look in a real browser before shipping is recommended.

### What the Next Worker Needs

This is the final feature round (Round 4) per the brief — no further worker is scheduled to extend `GraphView.tsx`. For the integration/QA pass:
- `useNodeFadeIn()` must be mounted exactly once (same constraint as Round 3's `useTraversalSync`) — it currently is, from `GraphView` itself.
- `reprojectNodeToScreen` and `graphCameraControls`/`edgeHighlightKey` (Round 3) are both exported from `GraphView.tsx` and can be imported by any future test or tool needing the same seams.
- `SELECT_NODE`/`ADD_EDGES` are new `GraphAction` variants; any full-app integration test asserting on the complete `GraphAction` union should account for both.

### Blockers

None. Both dependency reports (`worker-graph3d-report.md`, `worker-traversal-report.md`) existed, were non-stub, and matched the actual current code exactly as documented — no missing-file waits were needed.
