# Worker Brief: graph3d (Round 2 — Issue 6)

You are one of THREE workers running in parallel directly in `/workspace/frontend` (no worktree). The others own the chat/WS layer and the folder panel. **Touch ONLY the files listed under "Files you own".**

Foundation (Round 1) is done and verified. Read `/workspace/docs/frontend/agent-reports/worker-foundation-report.md` FIRST — exact state types (`GraphNode {id,name,description,source_files}`, `GraphEdge {source,target,relation}`, `SET_GRAPH` action), provider hooks, theme tokens, and test-fixture APIs.

## MANDATORY FIRST STEP — design skill

The user explicitly demands the UI look **absolutely futuristic — at minimum the graph visualization**. This issue IS the centerpiece. Before writing any rendering/styling code, invoke the `frontend-design:frontend-design` skill (Skill tool) and apply it to the 3D scene's visual identity: node treatment (glow/material), edge relation-type styling, background, lighting/atmosphere. Anchor to the established theme: ion `#6ee7f9` (primary accent), synapse `#b389ff` (secondary), void background (deep indigo-black), muted `#7c8699`. The scene must feel like a sci-fi knowledge graph — glowing nodes, luminous edges — not a default force-graph demo.

## Backend contract (FINAL — from /workspace/backend/api/graph_routes.py)

`GET /api/graph` → `{"nodes":[{"id","name","description","source_files"}], "edges":[{"source","target","relation"}]}`. Empty graph → `{"nodes":[],"edges":[]}` (200, never an error). No pagination. Relation labels are typed but open-ended strings (e.g. `is_a`, `depends_on`, plus freeform verb phrases). Use the relative URL `/api/graph` (Vite proxy).

## Issue 6 — 3D concept graph initial render

Fetch the graph and render it with `react-force-graph-3d` (already installed: react-force-graph-3d 1.29.1 + three 0.185.1) as an orbit-able 3D WebGL scene inside `GraphView`.

Acceptance criteria:
- On load (folder with an existing graph), all persisted nodes and edges render in the 3D scene.
- Each edge visually reflects its relation-type label (distinct styling per relation type — color/particle treatment — with a deterministic mapping and a valid fallback for unseen/freeform labels; label text on hover or always, your design call).
- Orbit, zoom, and pan camera controls work (ForceGraph3D's built-in trackball controls satisfy this — verify they're enabled).
- Loading a folder with no graph yet renders an empty scene without erroring (keep a themed empty-state hint overlaid or nothing — no crash, no error UI).

Implementation requirements:
- `useGraphData` hook (`src/hooks/useGraphData.ts`): fetches `/api/graph`, dispatches `SET_GRAPH`, refetches when ingestion `folderPath` changes. GraphView renders from graph slice state (single source of truth — Round 3/4 highlight/fade-in work reads the same slice).
- Pure relation→style mapping util in `src/lib/edgeStyles.ts` (unit-test stub `GraphEdgeStyling.test.ts` targets a pure function: distinct styles for distinct known relations, stable fallback for unknown labels, never throws).
- Structure `GraphView.tsx` for extension: Round 3 adds traversal highlight + camera-follow; Round 4 adds node fade-in + click HUD overlay. Keep the ForceGraph3D element's props centralized and factor node/edge styling accessors so later workers extend rather than rewrite. Add a plain `onNodeClick` no-op seam (or leave a clearly commented extension point) but do NOT build the HUD.
- MUST keep: `data-testid="graph-view"`, `flex-1`, `min-h-[320px]` on the container (AppShell tests depend on them). Size the canvas to the container (ResizeObserver or ForceGraph3D width/height props).

## What NOT to build

- No traversal highlighting, camera-follow, or particle pulses on visited edges (Issue 10, Round 3).
- No node fade-in animation (Issue 7) or HUD overlay (Issue 8) — Round 4.
- No polling — one fetch per folder load is correct this round.
- No new dependencies (three + react-force-graph-3d are installed; do not add react-three-fiber/drei/postprocessing libs — if you conclude one is truly needed for an acceptable result, note it in your report and do without for now).

## Files you own (complete list — nothing else)

- `src/components/graph/**` (replace GraphView placeholder internals; add subcomponents as needed)
- `src/hooks/useGraphData.ts`, `src/lib/edgeStyles.ts` (new)
- Tests copied from `/workspace/docs/frontend/tests/` into `/workspace/frontend/tests/` (same relative paths) and implemented: `unit/GraphEdgeStyling.test.ts`, `integration/useGraphData.test.tsx`

FROZEN (do not touch): package.json, vite.config.ts, tsconfig*, src/index.css (define scene colors as constants in your own modules, derived from the token hexes above — three.js needs raw color values anyway), src/App.tsx, src/state/** (SET_GRAPH exists; the realtime-chat worker has exclusive state-file edit rights this round), src/components/chat/**, src/components/folder/**, src/components/ui/**, tests/setup.ts, tests/unit/{reducers,AppShell,ThemeProvider,CollapsiblePanel}.test.*. Frozen-file change needed? Don't — report it.

## Testing notes (critical)

- **jsdom has no WebGL.** `ForceGraph3D` will not render in vitest. In `useGraphData.test.tsx`, `vi.mock("react-force-graph-3d", ...)` with a lightweight stand-in that records the `graphData` prop (assert "all returned nodes/edges are present in the rendered scene" via what's passed to the mocked component / what's in graph state), and assert edge styling via your pure `edgeStyles` mapping applied to the payload. Document the mock pattern in your report — Rounds 3-4 reuse it.
- `mockFetch({graphRead: {status, body}})` from `tests/setup.ts` stubs the endpoint.
- Existing 15 tests must stay green.
- Also sanity-check the REAL renderer compiles into the production bundle: `npm run build` must pass (it exercises the non-mocked import).

## Verification (synchronous — never end your turn waiting on a background run)

1. `cd /workspace/frontend && npx vitest run` — everything passes. 2. `npx tsc -b` clean. 3. `npm run build` succeeds. Paste real numbers.

## Report — /workspace/docs/frontend/agent-reports/worker-graph3d-report.md

Include: files created/edited, the design decisions made under the frontend-design skill (node/edge/scene treatment, relation-style mapping scheme), GraphView's extension points for Rounds 3-4 (exact prop/function seams: how to set highlight state, how to hook node clicks, how camera access works — ForceGraph3D ref API), the ForceGraph3D jsdom mock pattern, `useGraphData`/`edgeStyles` public APIs (verbatim TS), test/typecheck/build results, deviations, gotchas.
