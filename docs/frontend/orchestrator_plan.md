# Frontend Orchestrator Plan — docuFetch Graph

Date started: 2026-07-06
Source of truth: docs/frontend/issues.md (14 issues), tests.md + tests/ stubs (66 cases), prd.md, features.md, grill_doc_roadmap.md.

## Finalized backend contracts (read from shipped code, no longer open)

- **WS `/ws/chat`** (backend/api/ws_routes.py): client sends `{"query": "<text>"}`. Server streams, in order:
  `{"type":"visit_node","node_id","concept","hop","via_relation"}` per step →
  `{"type":"traversal_complete","nodes_visited","hops_used"}` →
  exactly one of `{"type":"answer","text"}` or `{"type":"no_match","message"}`.
  Errors: `{"type":"error","message"}` without closing the socket. Socket serves multiple queries sequentially.
- **GET `/api/folder-config`** → `{"path": <str>}`. **POST** `{"path": <str>}` → 200 `{"path","status":"watching"}`; 422 `{"detail": <reason>}` for missing/non-dir paths. A switch purges graph + vector store and resets the chat session server-side.
- **GET `/api/graph`** → `{"nodes":[{"id","name","description","source_files"}], "edges":[{"source","target","relation"}]}`. Empty arrays before ingestion (never an error). No pagination.
- **No ingestion-status events exist in the backend** (no WS ingestion channel, no /ingest/status endpoint). Planning-era assumption corrected: Issues 5 and 7 degrade to **polling GET /api/graph** (diff node counts/ids) to derive status and drive node fade-in. Recorded in frontend_context.md decision D3.

## Architecture-level decisions

- App lives in `/workspace/frontend/` — Vite + React + **TypeScript** (test stubs are .ts/.tsx), Tailwind, shadcn/ui-style primitives, react-force-graph-3d.
- Vite dev proxy: `/api` → http://localhost:8000, `/ws` → ws://localhost:8000.
- Test suite lives in `frontend/tests/` mirroring `docs/frontend/tests/` (setup.ts + unit/ + integration/ + e2e/). Stubs are copied in and implemented **progressively** — each worker copies + implements only the test files it owns, so the suite is green after every round (unimplemented stubs never sit in frontend/tests throwing).
- **All npm dependencies are installed once in Round 1.** package.json, vite.config.ts, tailwind/theme token files, tsconfig, and tests/setup.ts are FROZEN after Round 1 — later workers may not edit them; if one genuinely needs a change it reports the need and the orchestrator reconciles serially.
- **No worktree isolation for workers.** Workers edit /workspace/frontend directly under strict per-worker file ownership declared in each brief. Rationale: backend build lesson — worktree copy-in/copy-out silently clobbered shared files; plus node_modules cannot be cheaply duplicated per worktree. Parallel safety comes from disjoint file sets, not isolation.

## Build order (rounds)

### Round 1 — serial foundation (1 worker)
- **worker-foundation**: Issues 1 + 2 + all test infrastructure.
  Scaffold Vite+React+TS app, install ALL deps for the whole build, Vite proxy, dark neon/glow theme (**frontend-design skill required**), three-panel responsive shell with placeholder panel files (FolderPanel.tsx / GraphView.tsx / ChatPanel.tsx — these become later workers' ownership boundaries), shared CollapsiblePanel, Context+useReducer state layer (graph / chat / ingestion reducers with the action set the test stubs name), vitest config, full setup.ts implementation (mockFetch/mockWebSocket/resetAllMocks/resetLocalStorage).
  Owns/implements tests: setup.ts, unit/reducers, unit/AppShell, unit/ThemeProvider, unit/CollapsiblePanel.

### Round 2 — 3 parallel workers (disjoint files)
- **worker-realtime-chat**: Issues 3, 9, 13. Owns: src/lib/ws + useWebSocket hook, chat components (input, transcript, collapse behavior), useChatSession. Tests: integration/useWebSocket, integration/useChatSession, integration/ChatPanelCollapse.
- **worker-folder-input**: Issue 4. Owns: folder panel components (path input, inline error), useFolderConfig hook. Tests: unit/FolderPathInput, integration/useFolderConfig.
- **worker-graph3d**: Issue 6 (**frontend-design skill required**). Owns: graph components (3D scene, edge styling util), useGraphData hook. Tests: unit/GraphEdgeStyling, integration/useGraphData.

### Round 3 — 2 parallel workers (disjoint files)
- **worker-traversal**: Issues 10, 11, 12 (**frontend-design skill required**). Owns: useTraversalSync, TraceBlock, AnswerMessage, NoMatchMessage, graph highlight/camera-follow wiring inside graph components, chat message rendering. Tests: unit/TraceBlock, unit/AnswerMessage, unit/NoMatchMessage, integration/useTraversalSync, integration/GlobalStateCrossPanel.
- **worker-folder-live**: Issues 5, 14. Owns: FolderStatusLine, useIngestionStatus (polling-derived), folder-switch reset flow (dispatches reducer resets; does NOT edit graph/chat component files). Tests: unit/FolderStatusLine, integration/useIngestionStatus, integration/useFolderSwitch.
  - Conflict note: worker-traversal owns graph component edits this round; worker-folder-live must not touch them.

### Round 4 — 1 worker (both issues edit graph components → same worker)
- **worker-graphfx**: Issues 7, 8 (**frontend-design skill required**). Owns: node fade-in (poll-driven new-node animation), HUD detail overlay with per-frame 3D→2D reprojection. Tests: integration/useNodeFadeIn, unit/NodeDetailOverlay, integration/NodeDetailOverlayInteraction.

### Round 5 — integration (1 worker)
- **worker-integration**: wire-up audit, full `npx vitest run` (all 22 unit+integration files), `tsc --noEmit`, `npm run build`. Copy the 4 Playwright e2e specs into frontend/tests/e2e; run against the real backend if feasible, otherwise document as manual-verification. Produce integration report. Gate for SHIPPED.

## Risks

1. **GraphView contention** (Issues 6→10→7/8 all extend the graph scene): mitigated by serializing rounds 2→3→4 for graph-touching work and single-worker Round 4.
2. **react-force-graph-3d in jsdom tests**: WebGL doesn't exist in jsdom — graph tests must mock the ForceGraph3D component or assert at hook/state level. Briefs call this out; foundation installs vitest mocks capability.
3. **Ingestion status degradation** (no backend events): polling design must still satisfy test-spec behavior (watching/extracting/idle variants). FolderStatusLine remains prop-driven per stubs.
4. **Worker self-reports unreliable**: orchestrator re-runs owned test files + a full-suite smoke after every round before marking done.
5. **npm registry access**: verified node 20 / npm 10.8 available; first-round install failure is a hard blocker to escalate.

## Test-file → worker ownership map

| Test file | Worker |
|---|---|
| setup.ts, unit/reducers, unit/AppShell, unit/ThemeProvider, unit/CollapsiblePanel | foundation |
| integration/useWebSocket, useChatSession, ChatPanelCollapse | realtime-chat |
| unit/FolderPathInput, integration/useFolderConfig | folder-input |
| unit/GraphEdgeStyling, integration/useGraphData | graph3d |
| unit/TraceBlock, AnswerMessage, NoMatchMessage; integration/useTraversalSync, GlobalStateCrossPanel | traversal |
| unit/FolderStatusLine; integration/useIngestionStatus, useFolderSwitch | folder-live |
| unit/NodeDetailOverlay; integration/NodeDetailOverlayInteraction, useNodeFadeIn | graphfx |
| e2e/* (4 Playwright specs) | integration (best-effort vs real backend) |
