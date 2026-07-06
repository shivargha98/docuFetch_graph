# PM Loop Context — Frontend

**Scope:** frontend
**Feature:** docuFetch Graph frontend
**Date:** 2026-07-05

## Important Decisions
Source of truth for architecture decisions is `docs/frontend/grill_doc_roadmap.md` (13-item decision log from prior grill-me session, explicit user steer toward a "futuristic" look). Key decisions carried into this PM loop:
- Build tooling: Vite + React (no SSR/routing needs).
- Graph rendering: `react-force-graph` in 3D/WebGL mode (chosen over Sigma.js/Cytoscape.js for dramatic sci-fi feel).
- Layout: three-panel — collapsible folder panel | dominant 3D graph | collapsible chat panel.
- Folder selection: absolute-path text input, validated by backend (browsers can't expose real FS paths).
- Live traversal visualization: sequential per-hop highlight + camera-follow, driven by WS events.
- Chat trace UX: inline collapsible "trace" block above each answer, collapsing into "show reasoning path" once answer arrives.
- State management: React Context + `useReducer`, one reducer per concern (graph, chat/traversal, ingestion/connection).
- Component base: shadcn/ui re-themed with dark neon/glow Tailwind theme.
- Node click interaction: floating HUD-style overlay card (description, source files, linked concepts), reprojected to 2D screen space each frame.
- Ingestion status: live WS-driven indicator in folder panel; nodes fade/pop into graph as ingestion adds them (polling rejected as less immediate).
- Responsiveness: down to tablet width, panels stack below breakpoint.
- Theming: dark-only, no light mode/toggle.
- "No relevant document found": visually distinct muted/neutral message style, no trace block attached.

**This frontend depends on backend contracts left deliberately open on the backend side** (per `docs/backend/context.md` and `docs/backend/issues.md`):
- WebSocket traversal-event schema → pinned to **backend Issue 14** (only the concept+hop-number-per-step + distinct completion event + distinct final-answer event ordering is fixed; full event/error schema still open).
- Folder configuration endpoint (path/method/payload) → pinned to **backend Issue 15** (behavior is fixed: reflects `WATCH_FOLDER` default, tears down/restarts watcher + chat session on new path, error on invalid path — exact request/response shape open).
- Graph read endpoint (path/method/payload, pagination) → pinned to **backend Issue 16** (behavior fixed: returns all nodes/typed edges for active folder, empty-not-error before ingestion — exact response shape/pagination open).

**Explicitly deferred items (from frontend grill doc) — features/issues must account for these as open design points, not silently resolve them:**
- Exact WebSocket event type contract (event names/payload shapes beyond illustrative examples) — joint finalization with backend Issue 14.
- Specific color/design tokens for the neon/glow theme (palette values, glow intensity, glassmorphism parameters) — natural fit for `frontend-design`/`dataviz` skills during implementation, not this PM loop.
- Specific animation/rendering helper libraries (e.g. `react-three-fiber` + `drei` alongside `react-force-graph`).
- Exact touch interaction behavior for the 3D graph at tablet breakpoints.
- Frontend testing strategy — explicitly out of scope this round (see Round Completion Summary).

**This PM loop round is scoped to PRD → features → issues only.** Test suite generation explicitly NOT requested by the user this round — do not run test-suite-generator-frontend.

## Key Outputs by Stage

### PRD
Saved to `docs/frontend/prd.md`. Synthesized directly from `grill_doc_roadmap.md` — no new interview conducted.

- **Core problem:** the backend alone is invisible — no way to point it at a folder, see the concept graph it builds, or watch how an answer was derived (vs. a flat black-box response). Explicit user steer: the UI must feel futuristic, especially the graph.
- **Primary user stories (24 total):** folder path input + validation + default prefill + switching, live ingestion status, collapsible folder panel, 3D orbit-able graph with live node fade-in and typed edges, node-click HUD detail overlay (anchored, drift-free), chat panel with live per-hop traversal highlight + camera-follow on the graph, synced live-updating trace block collapsing to "show reasoning path", 4-5 line answer, visually distinct no-trace no-match message, collapsible chat panel, tablet-width responsiveness with panel stacking, dark-only neon/glow theme, cross-panel state consistency.
- **Key constraints/decisions carried in verbatim from grill doc:** Vite+React, react-force-graph 3D mode, three-panel layout, absolute-path text input for folder selection, sequential per-hop highlight+camera-follow traversal viz, inline collapsible trace UX, React Context+useReducer (one reducer per concern), shadcn/ui re-themed dark neon/glow, floating HUD overlay for node clicks, WS-driven live ingestion status, tablet-width responsive breakpoint, dark-only theme.
- **Scope boundaries (explicitly out of scope):** exact WS event schema (→ backend Issue 14), exact folder-config API shape (→ backend Issue 15), exact graph-read API shape (→ backend Issue 16), specific neon/glow design token values, specific animation helper libraries (react-three-fiber/drei), exact tablet touch gesture mapping, frontend testing strategy, light theme/toggle (rejected outright, not deferred), backend-side behavior, phone-width layouts, auth/multi-user.

**Self-check:** PRD is coherent and traces cleanly to all 13 grill-doc decisions plus its 5 deferred items, and correctly threads the 3 backend cross-cutting dependencies (Issues 14/15/16) as open rather than inventing wire shapes. No fabricated decisions introduced.

### Features
Saved to `docs/frontend/features.md`. 16 features across 5 modules: App Shell & Layout (3), Folder Panel (3), Concept Graph View (4), Chat Panel (5), Realtime Connectivity (1).

- **Added vs. PRD:** none invented — every feature traces to an explicit PRD implementation decision or user story. Six features carry an "Open question" callout (Folder Path Input & Validation, Folder Switching & Session Reset → backend Issue 15; Live Ingestion Status Display, Live Node Fade-In on Ingestion, Live Traversal Highlight & Camera-Follow, Live Traversal Trace Block, WebSocket Client & Connection Lifecycle → backend Issue 14; 3D Graph Rendering & Initial Load → backend Issue 16; Dark Neon/Glow Theme System → implementation-time design tokens, not a backend dependency).
- **Removed vs. PRD:** none.
- **Prioritization:** not explicitly ranked by this skill; module grouping followed PRD's implementation-decision order. Natural build sequencing implied by dependencies below.
- **Dependencies flagged:**
  - Concept Graph View's "3D Graph Rendering & Initial Load" is the foundational feature nearly everything visual depends on (node click overlay, live fade-in, traversal highlight all render onto this scene).
  - Folder Panel features gate everything else — no graph or chat state exists until a folder is validated and loaded.
  - Realtime Connectivity's "WebSocket Client & Connection Lifecycle" is a prerequisite for Live Ingestion Status Display, Live Node Fade-In, Live Traversal Highlight & Camera-Follow, Live Traversal Trace Block, and Chat Query Submission — all consume the same connection.
  - Global App State (reducers) is cross-cutting infrastructure other features read/write into rather than a standalone user-facing feature.

**Self-check:** All 24 PRD user stories map to at least one feature (verified by walkthrough) — no orphaned stories. No contradictory features found between modules.

### Issues
Saved to `docs/frontend/issues.md`. 14 issues total, written as tracer-bullet vertical slices in dependency order.

- **Breakdown:** Issue 1 (static three-panel shell + theme) and Issue 2 (global state layer) are the foundational slices nearly everything else depends on. Issue 3 adds the WebSocket connection lifecycle used by five downstream issues. Issues 4-5 build folder input/validation and status display. Issues 6-8 build the 3D graph's initial render, live fade-in, and node-click overlay. Issues 9-13 build chat query submission, the synced trace+graph-highlight feature, answer display, no-match display, and panel collapse. Issue 14 (folder switching/session reset) is last since it needs graph, chat, and folder-input pieces already in place to demonstrate teardown.
- **Issues spanning multiple features:** Issue 1 covers 2 features (Three-Panel Responsive Layout, Dark Neon/Glow Theme System). Issue 10 covers 2 features (Live Traversal Trace Block, Live Traversal Highlight & Camera-Follow) since they're driven by the same WS traversal-step event stream and are only meaningfully verifiable together.
- **Implementation order (as written):** 1 → 2 → 3 → 4 → 5 (needs 3+4); separately 6 (needs 2+4) → 7 (needs 5+6) → 8 (needs 6); separately 9 (needs 3) → 10 (needs 6+9) → 11 (needs 10); 12 (needs 9), 13 (needs 9) in parallel with 10/11; 14 (needs 4+6+9) last.
- **Open questions preserved as issue-level caveats (not resolved):** design tokens (Issue 1), WS event schema (Issues 3, 5, 7, 10), folder-config API shape (Issues 4, 14), graph-read API shape (Issue 6).
- **Process note:** the issues-creator skill's normal flow includes an interactive "review the breakdown with the user" checkpoint before writing `issues.md`. Running autonomously as part of this PM loop (per the user's instruction to run the full pipeline and report back at the end), that checkpoint was substituted with a self-check coverage table (in `issues.md`) rather than pausing mid-skill for human review. Flagging this so the user can request revisions to `issues.md` directly if the granularity/dependencies don't match their expectations.

**Self-check:** Verified via the feature-coverage table in issues.md — all 16 features from features.md map to at least one issue. No gaps found.

### Test Suite
Saved to `docs/frontend/tests.md` (plan) and `docs/frontend/tests/` (stub files). Generated via test-suite-generator-frontend, cross-referencing `prd.md`, `features.md`, and `issues.md`. Stack matches the grill doc's Q14 decision: Vitest + React Testing Library (network boundary mocked) for unit/integration, Playwright for E2E.

- **Coverage:** 66 test cases — 32 unit, 30 integration, 4 E2E — across 26 stub files (`setup.ts` + 11 unit + 11 integration + 4 e2e).
- **Types of tests generated:** unit tests for pure/presentational components (layout, theme, reducers, status line, trace block, message variants, node overlay, edge-styling util) with no network involved; integration tests for hooks that consume mocked `fetch`/WebSocket (folder config, folder switch, ingestion status, graph data, node fade-in, chat session, traversal sync, panel collapse, node-overlay graph interaction, cross-panel global state); a deliberately small set of 4 E2E flows against the real backend (full query flow, no-match flow, folder-switch flow, responsive-tablet flow).
- **Issues/features with no testable acceptance criteria:** none found — all 16 features and all 14 issues map to at least one test (self-check table in `tests.md`); all 24 PRD user stories map to at least one integration or E2E test.
- **Notable edge cases captured:** empty-graph-before-ingestion render (no error), overlapping-query prevention while a traversal is in-flight, empty-question no-op submission, trace/highlight independence across multiple past queries, in-progress traversal continuing to update state while the chat panel is collapsed, and node-overlay reprojection drift while the camera orbits/zooms.
- **Cross-cutting backend dependency caveats threaded into tests:** 11 tests (across `useWebSocket`, `useFolderConfig`, `useFolderSwitch`, `useIngestionStatus`, `useGraphData`, `useNodeFadeIn`, `useTraversalSync`) assert only the behavior fixed by the PRD/issues against an illustrative, explicitly-commented-as-provisional mocked payload — not a final contract test. These must be revisited once backend Issues 14 (WS schema), 15 (folder-config shape), and 16 (graph-read shape) land.
- **Gaps/deliberate non-coverage (documented in `tests.md`):** node-overlay screen-space reprojection accuracy is tested with a mocked camera-state input, not a real three.js/WebGL render loop (judged too brittle for this pass); exact animation/rendering helper library choice (react-three-fiber/drei vs. react-force-graph alone) is untested since it's an implementation-time choice, not a behavior; design-token-specific visual regression (exact glow colors) is out of scope per the PRD.

**Self-check:** Verified via the coverage table in `tests.md` — all 16 features have at least one test, all 24 PRD user stories map to at least one integration/E2E test. No gaps found beyond the deliberate non-coverage documented above.

## Open Questions / Risks
Carried forward from grill doc's deferred list, now attached to specific issues and tests rather than floating at the PRD level:
- Exact WebSocket event/payload schema → Issues 3, 5, 7, 10; tests `useWebSocket`, `useIngestionStatus`, `useNodeFadeIn`, `useTraversalSync` (all pinned to backend Issue 14, mocked payloads marked provisional).
- Folder-configuration API request/response shape → Issues 4, 14; tests `useFolderConfig`, `useFolderSwitch` (pinned to backend Issue 15).
- Graph-read API response shape/pagination → Issue 6; test `useGraphData` (pinned to backend Issue 16).
- Neon/glow design token values → Issue 1; test `ThemeProvider` (implementation-time design pass, natural fit for `frontend-design`/`dataviz` skills).
- Animation/rendering helper libraries (react-three-fiber/drei) → not yet pinned to a specific issue; surfaces naturally during Issues 6/7/8/10 implementation; untested by design since it's a library choice, not a behavior.
- Tablet touch interaction specifics → not yet pinned to a specific issue; surfaces naturally during Issue 1 (layout) and Issue 6 (graph camera controls) implementation.
- Node-overlay screen-space reprojection accuracy → tested only against a mocked camera-state input in `NodeDetailOverlayInteraction`; a true rendering-accuracy check was judged too brittle/expensive for this pass.
- **Issues.md was not human-reviewed** — the issues-creator skill's interactive review checkpoint was replaced with a self-check (see Issues section above); the user should review `issues.md` directly and request revisions if needed.

## Round Completion Summary (PRD → Features → Issues → Test Suite)
**Status:** Complete. Full PM loop finished for the frontend, including the test suite step (initially deferred, then requested via the coordinator and completed in a follow-up pass the same day).
**Total features:** 16 (across 5 modules)
**Total issues:** 14 (tracer-bullet vertical slices, dependency-ordered)
**Test coverage:** 66 test cases (32 unit, 30 integration, 4 E2E) across 26 stub files; all features/issues/user stories covered per the self-check tables in `tests.md`.
**Key decisions made this round:**
- Synthesized PRD directly from the existing `grill_doc_roadmap.md` with no further interview, per prd-generator's process.
- Grouped features into 5 modules derived from the PRD's Implementation Decisions list (App Shell & Layout, Folder Panel, Concept Graph View, Chat Panel, Realtime Connectivity).
- Combined two closely-coupled feature pairs into single issues (Issue 1: layout+theme; Issue 10: trace+graph-highlight sync) since each pair is only meaningfully verifiable together.
- Ran issues-creator's drafting step autonomously (no interactive mid-skill review), consistent with the backend pass; flagged explicitly so the user can request issue-level revisions.
- Threaded all three cross-cutting backend contract dependencies (WS schema/Issue 14, folder-config API/Issue 15, graph-read API/Issue 16) through PRD → features → issues → tests as open caveats rather than inventing shapes at any layer.
- For tests touching open backend contracts, asserted only PRD/issue-fixed behavior against illustrative mocked payloads explicitly commented as provisional, rather than inventing a final wire shape to test against.
**Risks or open questions remaining:** the three backend-contract dependencies and the frontend grill doc's own deferred items (design tokens, animation libraries, touch gestures) are unresolved by design and are now pinned to specific issues and tests so they resurface when those issues are picked up for implementation. `issues.md` has not been human-reviewed yet.

## Amendment (2026-07-05): `frontend-design` skill callouts

After reviewing `features.md` and `issues.md`, the user requested a surgical amendment: annotate every feature/issue where genuine visual-design judgment is made (color, glow/highlight treatment, typography, motion/animation feel, HUD styling) with a short callout to use the `frontend-design` skill during implementation, so that work doesn't default to templated-looking shadcn/Tailwind defaults. Purely behavioral/logical entries (state wiring, WebSocket connection handling, validation flows, session-reset teardown) were deliberately left unannotated per the user's instruction.

**Annotated (8 of 16 features, 7 of 14 issues)** — one `**Design note:**` line added after the existing acceptance criteria/caveat, no other restructuring:
- Features: Dark Neon/Glow Theme System, 3D Graph Rendering & Initial Load, Live Node Fade-In on Ingestion, Node Click HUD Detail Overlay, Live Traversal Highlight & Camera-Follow, Live Traversal Trace Block, Answer Display, No-Match Message Display.
- Issues: Issue 1 (theming portion only), Issue 6, Issue 7, Issue 8, Issue 10, Issue 11, Issue 12.

**Deliberately left unannotated** (behavioral, no visual-design decision): Three-Panel Responsive Layout, Global App State, Folder Path Input & Validation, Folder Switching & Session Reset, Live Ingestion Status Display, Chat Query Submission, Collapsible Chat Panel, WebSocket Client & Connection Lifecycle (features); Issue 2, 3, 4, 5, 9, 13, 14 (issues). Live Ingestion Status Display and Collapsible Chat Panel were judged borderline (they render UI state) but their acceptance criteria are about correctness/timing, not color/typography/aesthetic treatment, so they were left out — worth a second look if the user disagrees with that line.

**Why kept surgical:** per project convention, edits to existing PM docs should be additive and minimal rather than restructuring — a one-line callout preserves the existing acceptance-criteria/caveat format instead of rewriting feature/issue descriptions.

## Amendment (2026-07-06): Backend contracts FINALIZED — supersedes all "pinned to backend Issue 14/15/16" caveats

Backend Issues 14/15/16 are shipped. The wire contracts are no longer open questions; the shipped code is the source of truth:

- **WS `/ws/chat`** (`backend/api/ws_routes.py`): client sends `{"query": "<text>"}`. Server streams `{"type":"visit_node","node_id","concept","hop","via_relation"}` per step, then `{"type":"traversal_complete","nodes_visited","hops_used"}`, then exactly one of `{"type":"answer","text"}` or `{"type":"no_match","message"}`. Errors arrive as `{"type":"error","message"}` without closing the socket.
- **Folder config** (`backend/api/config_routes.py`): GET `/api/folder-config` → `{"path"}`. POST `{"path"}` → 200 `{"path","status":"watching"}` or 422 `{"detail"}`. A switch purges graph + vector embeddings and resets the chat session server-side.
- **Graph read** (`backend/api/graph_routes.py`): GET `/api/graph` → `{"nodes":[{"id","name","description","source_files"}],"edges":[{"source","target","relation"}]}`; empty arrays (not an error) before ingestion; no pagination.

**Planning assumption corrected:** there is NO ingestion-status event stream in the shipped backend (no ingestion WS events, no /ingest/status). The grill-doc decision #10 (WS-pushed ingestion status; polling "rejected") cannot be implemented as designed. Live ingestion status (Issue 5) and node fade-in (Issue 7) are implemented by polling GET /api/graph and diffing node ids. See docs/frontend/frontend_context.md decision D3 for the full degradation design.

Build execution is tracked in docs/frontend/frontend_TASKS.md and docs/frontend/orchestrator_plan.md.
