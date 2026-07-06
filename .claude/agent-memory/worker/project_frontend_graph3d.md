---
name: project-frontend-graph3d
description: Gotchas from building the docuFetch Graph 3D scene (react-force-graph-3d) and Round 3's traversal highlight/camera-follow seams, that later graph-touching frontend workers (Round 4+) need to know before rendering/extending GraphView in jsdom.
metadata:
  type: project
---

Built in Round 2 (worker-graph3d, 2026-07-06) at `/workspace/frontend/src/components/graph/GraphView.tsx`.
Two non-obvious jsdom/WebGL gotchas surfaced that later rounds touching this
component (Round 3 traversal highlight/camera-follow, Round 4 fade-in/HUD)
need to preserve the fixes for, not just the features:

- **jsdom has no WebGL, and mounting the real (un-mocked) `GraphView`
  anywhere throws synchronously** (`THREE.WebGLRenderer: Error creating
  WebGL context`), during the commit phase, in a way that would otherwise
  crash any test rendering the full `<App>` (e.g. the frozen
  `AppShell.test.tsx` / `ThemeProvider.test.tsx` from Round 1). Fixed with
  `GraphSceneErrorBoundary` (`src/components/graph/GraphSceneErrorBoundary.tsx`),
  a class-component error boundary wrapping `<ForceGraph3D>` that swaps in a
  themed fallback message on any mount-time error. Don't remove this
  boundary when extending `GraphView` — it's load-bearing for every non-mocked
  test that happens to render the graph panel, not just cosmetic.
- **`useGraphData`'s `fetch("/api/graph")` must swallow rejections**
  (`.catch(() => {})`) for the same reason: tests that mount `GraphView`
  without stubbing `fetch` (again, the frozen AppShell/ThemeProvider tests)
  produce an unhandled promise rejection that vitest reports as a failure.
  There is still no error-state UI for a failed graph load as of Round 2 —
  only success and empty-graph paths are in scope/tested.
- **Testing pattern for anything that renders `GraphView`:**
  `vi.mock("react-force-graph-3d", () => ({ default: (props) => { capturedProps = props; return null; } }))`
  — mock the default export as a prop-recording stand-in, then assert either
  on `capturedProps.graphData` or by calling the recorded accessor functions
  (`capturedProps.linkColor(edge)`) with sample data. See
  `tests/integration/useGraphData.test.tsx` for the full pattern. `waitFor`
  from `@testing-library/react` is sufficient to await the fetch→dispatch→
  re-render cycle; no manual `act()` needed.
- **Extension seams already in `GraphView.tsx`:** `fgRef` (ForceGraph3D
  imperative methods -- guard with `if (!fgRef.current) return`, same as the
  existing fog effect), the centralized `graphData` `useMemo`, and
  `handleNodeClick` (currently a literal no-op, wired to `onNodeClick`).
  Extend these in place rather than restructuring the `<ForceGraph3D>` prop
  list.
- Relation-type edge styling (`src/lib/edgeStyles.ts`,
  `relationTypeToEdgeStyle`) is a pure lookup: 5 known relations
  (`is_a`, `part_of`, `depends_on`, `causes`, `related_to`) each get a
  distinct color/width/particle-count combo (still only ion/synapse/one
  blended hue -- no rainbow, matching [[project-frontend-foundation]]'s
  duotone-only rule), plus one stable dim-slate fallback for any
  unrecognized/freeform relation string. Never throws.

See the full design rationale (node glow technique, fog/atmosphere, camera
controls) in `docs/frontend/agent-reports/worker-graph3d-report.md`.

**Round 3 additions (worker-traversal, 2026-07-06), for Round 4 (fade-in/HUD) to build on:**

- `GraphView.tsx` now also exports `graphCameraControls` (a module-level
  `{ current: GraphCameraControls | null }` ref, registered/cleared in a
  mount-only effect) and `edgeHighlightKey(sourceId, targetId)`. This is the
  seam `useTraversalSync` (`src/hooks/useTraversalSync.ts`, lives outside
  `GraphView`'s tree, watching chat state) uses to drive camera-follow
  through `fgRef` without `GraphView` needing to know anything about
  chat/traversal state. Chosen specifically because it's testable without
  mounting the real (WebGL-less-in-jsdom) 3D scene — `useTraversalSync`'s own
  tests just stub `graphCameraControls.current = { focusNode: vi.fn() }`.
  Reuse this same seam pattern for any future hook that needs to reach into
  `GraphView` from outside its render tree, rather than inventing a new one.
- **Per-node highlight/recoloring cannot route through `nodeThreeObject`** —
  `buildNodeGlowObject` (frozen `nodeGlow.ts`) ignores its node argument
  (uniform styling for every node). Round 3 worked around this by adding a
  second, independent system: synapse-colored sprite halos added directly to
  `fgRef.current.scene()` (own `highlightSpritesRef` Map, own tiny duplicated
  canvas-gradient texture, since `nodeGlow.ts` doesn't export its texture and
  is frozen), reactive off `state.highlightedNodeIds`. If Round 4's fade-in
  (Issue 7) needs real per-node animation, it likely needs to extend
  `buildNodeGlowObject`'s signature directly (per the graph3d report's own
  note) rather than trying to layer a third parallel system — two
  independent per-node THREE object systems (glow + highlight) is already the
  practical ceiling before this gets messy.
- **Chat messages (`AnswerMessage`/`NoMatchMessage`) do not carry a
  `queryId`** — confirmed by rereading `state/types.ts` and
  `worker-realtime-chat-report.md`: the frozen `useChatSession.ts` never
  attaches one when dispatching `ADD_MESSAGE`. Round 3 worked around this in
  `ChatTranscript.tsx` with positional pairing (assumes exactly one `Trace`
  per submitted query, in the same order as `messages`, since only one query
  can be in flight at a time). If a future round needs real query
  correlation (e.g. concurrent queries), `useChatSession.ts` will need an
  actual code change to thread `queryId` through — flag this rather than
  re-deriving another positional workaround.
