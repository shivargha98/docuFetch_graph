# Worker Brief: graphfx (Round 4 — Issues 7, 8)

You are the SOLE worker running this round in `/workspace/frontend` — no parallel worker this time, because both issues extend `GraphView.tsx` again and serializing avoids a repeat of the multi-round contention on that file. Still, only touch the files listed under "Files you own"; everything else is either frozen or belongs to a completed round.

Read these worker reports FIRST — they define the exact extension points and gotchas you're building on top of, discovered the hard way by three prior rounds of work on the same file:
- `/workspace/docs/frontend/agent-reports/worker-graph3d-report.md` — original `GraphView` structure: `fgRef`, `graphData` memo, `buildNodeGlowObject` (in `nodeGlow.ts`, frozen, ignores its node argument — uniform styling), `handleNodeClick` (currently a literal no-op wired to `onNodeClick` — THIS IS YOUR Issue 8 wiring point), the `vi.mock("react-force-graph-3d", ...)` jsdom test pattern (mandatory — no real WebGL in jsdom).
- `/workspace/docs/frontend/agent-reports/worker-traversal-report.md` — Round 3's additions to `GraphView.tsx`: `graphCameraControls` module-level ref seam, the highlight-sprite system (`highlightSpritesRef`/`buildHighlightSprite`/`getHighlightTexture`), `edgeHighlightKey`/`edgeEndpointId` helpers. Do not remove or restructure any of this — you're adding a fourth layer (fade-in + HUD) alongside highlight-sprites and the base node/edge rendering, not replacing anything.

## MANDATORY FIRST STEP — design skill

The user explicitly demands the UI look **absolutely futuristic**; the HUD overlay is called out in the grill doc as core to the "sci-fi HUD identity." Before writing any fade-in/HUD styling code, invoke the `frontend-design:frontend-design` skill. Anchor to the established tri-tone system (ion = structure/finality, synapse = live/in-motion, muted = absence) documented in the traversal report — do not invent a new palette for the HUD.

## Backend reality check (same as Round 3's D3 — no ingestion-event stream exists)

There is no WS ingestion channel and no per-node "new node" event from the backend. Issue 7's fade-in must be driven by the SAME polling mechanism Round 3 built: `useIngestionStatus` (in `src/hooks/useIngestionStatus.ts`, frozen — do not edit it) already polls `GET /api/graph` every 2500ms and dispatches `STATUS_UPDATE`, but it does NOT dispatch `SET_GRAPH`/`ADD_NODE` — that's `useGraphData`'s job (frozen, fetches once on folder load + folderPath change only, no polling). You need a new poll-diff mechanism specifically for detecting NEW nodes and adding them with `ADD_NODE` (the existing, already-tested `GraphAction` from Round 1) rather than a bulk `SET_GRAPH` re-fetch (which would blow away highlight state and cause a jarring full re-render).

## Issue 7 — Live node fade-in on ingestion

Build `useNodeFadeIn` (`src/hooks/useNodeFadeIn.ts`): polls `GET /api/graph` (reuse the same ~2-3s cadence as `useIngestionStatus` — you may run your own independent interval; do not try to share timers across hook files), diffs the returned node id set against `graphState.nodes`, and for each genuinely new node id, dispatches `ADD_NODE` (existing action — appends one node, does not replace the array, per Round 1's reducer contract: `tests/unit/reducers.test.ts` already asserts N→N+1 behavior, don't touch that reducer). Also diff edges and dispatch something to add new edges if the existing `GraphAction` union doesn't support incremental edge addition — check `src/state/graphReducer.ts`/`types.ts` first; if `ADD_NODE` only adds a node with no edges, you likely need one small additive action (e.g. `ADD_EDGES{edges}`) alongside it. Keep it additive-only, same rule as every prior round.

In `GraphView.tsx`, give newly-added nodes (ones not yet "settled") a fade/pop-in visual: track recently-added node ids (e.g. a `Set` with a short TTL, or a per-node "age" timestamp) and scale/fade their glow object in over ~500-800ms rather than appearing instantly at full opacity/scale. This likely means extending the `nodeThreeObject` call site (same seam the graph3d report pointed at for exactly this purpose) — since `buildNodeGlowObject` in `nodeGlow.ts` is frozen and ignores its node argument, follow Round 3's precedent: build a small parallel per-node fade wrapper in `GraphView.tsx` itself (or a new file you own) rather than editing the frozen file.

Acceptance criteria:
- A node added during an active session appears via fade/pop-in, not an abrupt appearance.
- Existing nodes' positions are undisturbed when a new node fades in (this should hold for free if you use `ADD_NODE`/incremental edge addition instead of any full `SET_GRAPH` replace — verify explicitly in your test).

## Issue 8 — Node click HUD detail overlay

Build `NodeDetailOverlay` (`src/components/graph/NodeDetailOverlay.tsx`): a floating glassmorphism HUD card (reuse the `.glass-panel` token from `index.css`, frozen but readable) showing a clicked node's `description`, `source_files`, and linked concepts (derive linked concepts from `graphState.edges` where the node is source or target, resolving the other endpoint's `name` via `graphState.nodes`) as clickable links/buttons.

Wire it up in `GraphView.tsx`:
- `handleNodeClick` (currently a no-op) should dispatch a `selectedNodeId` update. Check `GraphState`/`GraphAction` for how `selectedNodeId` is currently set (it exists as a field per Round 1's types but verify whether an action already targets it, or add one additively — e.g. `SELECT_NODE{nodeId | null}`).
- Render `<NodeDetailOverlay>` positioned near the selected node, reprojecting the node's live 3D position to 2D screen coordinates every frame. Use `fgRef.current.camera()` + `fgRef.current.graph2ScreenCoords(x,y,z)` if available on this version of `react-force-graph-3d` (check `node_modules` — the graph3d/traversal reports both did this kind of verification against installed library internals; do the same rather than guessing), or project manually via `THREE.Vector3.project(camera)` if that method isn't exposed. This needs a per-frame update loop (e.g. `requestAnimationFrame` while the overlay is open, or an `onEngineTick` prop if `ForceGraph3D` exposes one — check).
- Clicking a linked-concept link inside the overlay should dispatch the same `selectedNodeId`/highlight action for that other node (re-selecting), not just close and reopen — check whether reusing the Round 3 `HIGHLIGHT_NODE` action for this is appropriate or whether a distinct "selected" visual (vs. "traversal-highlighted") is warranted; your call, document it.
- Clicking outside the overlay, or re-clicking the same node, dismisses it (clear `selectedNodeId`).

Acceptance criteria:
- Clicking a node opens the overlay with description, source file(s), linked concepts.
- Clicking a linked-concept link highlights/selects that concept in the graph.
- Overlay stays anchored near its node without visible drift or occlusion while the camera orbits/zooms.
- Clicking outside (or re-clicking the node) dismisses it.

## Files you own (complete list — nothing else)

- `src/hooks/useNodeFadeIn.ts` (new)
- `src/components/graph/NodeDetailOverlay.tsx` (new)
- `src/components/graph/GraphView.tsx` (extend only — you are the sole worker touching this file this round, but still: do not restructure the `<ForceGraph3D>` element, `GraphSceneErrorBoundary`, or Round 3's highlight-sprite system; add alongside them)
- Additive edits only, and only if truly needed: `src/state/types.ts`, `src/state/graphReducer.ts` (new actions for incremental edge add / node selection, if not already present — check first)
- Tests copied from `/workspace/docs/frontend/tests/` into `/workspace/frontend/tests/` (same relative paths) and implemented: `unit/NodeDetailOverlay.test.tsx`, `integration/NodeDetailOverlayInteraction.test.tsx`, `integration/useNodeFadeIn.test.tsx`

Note on `useNodeFadeIn.test.tsx`: like Round 3's `useIngestionStatus.test.tsx`, the stub imports `mockWebSocket` and describes a "mocked ingestion event" — this describes the original WS-based design, which does not exist in the shipped backend. Adapt mechanically to the polling design (same pattern Round 3 used: `mockFetch({graphRead: ...})` + `vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync()`) while preserving the two asserted behaviors (fade-in animation, no disturbance to existing nodes). Document this deviation clearly, as Round 3 did.

FROZEN (do not touch): package.json, vite.config.ts, tsconfig*, src/index.css, src/App.tsx, `src/hooks/useFolderConfig.ts`, `src/hooks/useFolderSwitch.ts`, `src/hooks/useIngestionStatus.ts`, `src/components/folder/**`, `src/hooks/useWebSocket.ts`, `src/hooks/useChatSession.ts`, `src/hooks/useTraversalSync.ts`, `src/components/chat/**`, `src/hooks/useGraphData.ts`, `src/lib/edgeStyles.ts`, `src/components/graph/nodeGlow.ts`, `src/components/graph/sceneColors.ts`, `src/components/graph/GraphSceneErrorBoundary.tsx`, `src/state/chatReducer.ts`, `src/state/ingestionReducer.ts`, `src/state/providers.tsx`, `src/components/ui/CollapsiblePanel.tsx`, `tests/setup.ts`, all prior-round test files. If a frozen file seems to need a change, don't — report it.

## Testing notes (critical — same jsdom/WebGL constraint as every prior graph round)

- Use the `vi.mock("react-force-graph-3d", ...)` capture-props pattern from the graph3d report for anything touching `GraphView`.
- For the overlay's per-frame reprojection test, the stub explicitly says to use a mocked camera-state/reprojection input, not a real render loop — follow that; don't try to build a real WebGL screenshot test (no headless browser tool exists in this sandbox, confirmed by two prior workers).
- Existing tests (target: 19 files, 56 tests from Round 3) must stay green.

## Verification (synchronous — never end your turn waiting on a background run; if you spawn any background command, you must wait for and read its actual result yourself before reporting, in the SAME turn)

1. `cd /workspace/frontend && npx vitest run` — everything passes. If you see a single unrelated file fail with `[vitest-pool-runner]: Timeout waiting for worker to respond`, this is known sandbox flakiness (seen in Rounds 2-3) — re-run that one file in isolation to confirm it's not a real failure, and say so explicitly in your report; do not treat a real failure as flakiness without that isolated re-run as evidence.
2. `npx tsc -b` clean.
3. `npm run build` succeeds.
Paste real output numbers in the report.

## Report — /workspace/docs/frontend/agent-reports/worker-graphfx-report.md

Include: files created/edited, exact additive diffs to any state files, the fade-in mechanism (polling cadence, what triggers "settled" vs "new"), the reprojection mechanism chosen (which `react-force-graph-3d`/three.js API you confirmed is available and how), the node-selection vs traversal-highlight visual distinction (if any), design decisions made under the frontend-design skill, test/typecheck/build results, deviations, and anything the Round 5 integration worker needs to know (e.g., known-unverified-in-real-browser items, same as Round 3 flagged for its highlight sprites).
