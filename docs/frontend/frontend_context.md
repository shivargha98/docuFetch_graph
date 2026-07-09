# Frontend Build Context / Decisions Log — docuFetch Graph

Maintained by the frontend orchestrator. Start: 2026-07-06.

## D1 — Backend contracts finalized (supersedes planning-era "open questions" pinned to backend Issues 14/15/16)

Read directly from the shipped backend code (source of truth):

- **WS `/ws/chat`** (`backend/api/ws_routes.py`): client sends `{"query": "<text>"}`. Server streams per query, in order:
  1. `{"type":"visit_node","node_id":<str>,"concept":<str>,"hop":<int>,"via_relation":<str|null>}` — one per traversal step
  2. `{"type":"traversal_complete","nodes_visited":<int>,"hops_used":<int>}`
  3. exactly one of `{"type":"answer","text":<str>}` or `{"type":"no_match","message":<str>}`
  Any error → `{"type":"error","message":<str>}` WITHOUT closing the socket; the same socket serves subsequent queries.
- **Folder config** (`backend/api/config_routes.py`): GET `/api/folder-config` → `{"path":<str>}`. POST `{"path":<str>}` → 200 `{"path":<str>,"status":"watching"}` or 422 `{"detail":"Path does not exist"|"Path is not a directory"}`. Server-side, a switch purges graph + vector store and resets the chat session.
- **Graph read** (`backend/api/graph_routes.py`): GET `/api/graph` → `{"nodes":[{"id","name","description","source_files"}],"edges":[{"source","target","relation"}]}`. Empty graph → empty arrays, never an error. No pagination.

## D2 — Worker execution model: direct edits, no worktrees

Workers edit `/workspace/frontend` in place with strict per-brief file ownership (disjoint sets per parallel batch). Rationale: backend build lesson 1 (worktree copy-out clobbered shared files) + node_modules can't be duplicated cheaply. package.json, vite.config.ts, tsconfig, tailwind/theme token files, and tests/setup.ts are frozen after Round 1; changes to them go through the orchestrator serially.

## D3 — Ingestion status & node fade-in degraded to polling (planning assumption corrected)

The planning docs assumed WS-pushed ingestion events ("Extracting concepts from notes.md...", live node announcements). **The shipped backend has no such surface** — no ingestion WS channel, no /ingest/status endpoint; only GET /api/graph, GET/POST /api/folder-config, WS /ws/chat. Decision: `useIngestionStatus` polls GET `/api/graph` (~2-3s interval), diffs node ids, and derives status: `watching` (folder active, no change), `updating/extracting` (node set grew since last poll), `idle` (stable). Node fade-in (Issue 7) is driven by the same poll diff — new node ids enter the scene with a fade/pop animation. `FolderStatusLine` stays prop-driven exactly per the unit-test stubs (watching/extracting/idle variants), so the degradation is confined to the hook. Grill-doc's "rejected polling" note is explicitly overridden by reality of the shipped backend.

## D4 — Test suite lives in frontend/tests, implemented progressively

Stubs under docs/frontend/tests/ are the executable spec. Each worker copies ONLY its owned stub files into frontend/tests/ and implements them (ownership map in orchestrator_plan.md), so `npx vitest run` stays green after every round. E2E Playwright specs are handled by the integration worker, best-effort against a real backend.

## D5 — Design-skill mandate

User steer: UI must look absolutely futuristic, minimum the graph visualization. Every brief covering Issues 1, 6, 7, 8, 10, 11, 12 instructs the worker to invoke the `frontend-design:frontend-design` skill BEFORE writing UI code. Non-negotiable.

## D6 — Foundation contracts established by Round 1 (all later workers bound by these)

- Stack: Vite 8 + React 19 + TS ~6 + **Tailwind v4** (`@tailwindcss/vite`, tokens in `@theme` block in `src/index.css` — no tailwind.config.js). `defineConfig` in vite.config.ts comes from `vitest/config`; do not switch it.
- State: import types from `src/state/types.ts`; dispatch via `useGraphState()/useChatState()/useIngestionState()` from `src/state/providers.tsx` (each returns `{state, dispatch}`). Full type/action unions verbatim in worker-foundation-report.md.
- Theme tokens: `--color-ion` #6ee7f9 (primary neon accent — answers/highlights), `--color-synapse` #b389ff (secondary — edge pulses), `--color-muted` #7c8699 (no-match treatment, deliberately unglowing), `bg-void`, `.glass-panel`, `shadow-glow-ion/synapse/soft`, fonts display=Space Grotesk / body=Inter / mono=IBM Plex Mono.
- Responsive contract: shell = `flex flex-col md:flex-row`; graph-view keeps `flex-1 min-h-[320px]`; panels keep `md:flex-none`; testids `folder-panel`/`graph-view`/`chat-panel`. Tablet breakpoint = md/768px (assumption, flagged). AppShell tests assert these classes — do not refactor without updating that test in lockstep.
- Test fixtures: `tests/setup.ts` — `mockWebSocket()` handle exposes `instances[]` (each with `.sent`, settable handlers); `mockFetch({folderConfig, graphRead})` routes on URL substring. jest-dom must be imported via `@testing-library/jest-dom/vitest` subpath.
- Frozen after R1: package.json (all deps for whole build installed), vite.config.ts, tsconfig*, index.html, src/index.css, src/App.tsx. Round-2 exception: worker-realtime-chat has sole additive edit rights to state/types.ts, chatReducer.ts, ingestionReducer.ts (needs CONNECTION_STATUS action + in-flight-query flag) and CollapsiblePanel.tsx (additive prop for scroll-preserving collapse) — no other R2 worker may touch those.
- Known gap found by orchestrator: `IngestionState.connectionStatus` exists but there is no action to update it — worker-realtime-chat adds one (additive).
- No `npm test` script; use `npx vitest run`.

## D7 — Round 2 interfaces established (Round 3 builds directly on these)

**Chat/WS (worker-realtime-chat):**
- `useChatSession()` → `{ messages, submit, queryInProgress, connectionStatus }`. Mounted once at top of `ChatPanel.tsx` (survives collapse — do not mount a second `useWebSocket`/`useChatSession` elsewhere).
- WS event → dispatch mapping (in `useChatSession`): `visit_node → TRACE_STEP{queryId, step:{nodeId,concept,hop,viaRelation}}`; `traversal_complete → TRACE_COMPLETE{queryId}`; `answer → ADD_MESSAGE{kind:"answer",id,text}` then `QUERY_END`; `no_match → ADD_MESSAGE{kind:"no_match",id,message}` then `QUERY_END`; `error → QUERY_END` only (no transcript entry currently — flagged as an option for Round 3 to add visible error surfacing, not required).
- `ChatState.traces: Trace[]` (per queryId, ordered `TraceStep[]`, `collapsed` flag) is already fully populated by TRACE_STEP/TRACE_COMPLETE — **nothing renders `traces` visually yet**. This is Round 3's primary job (Issue 10's TraceBlock).
- `ChatState.activeQueryId` is **optional** (`string | null | undefined`), not required — do not make it required, it would break the frozen `tests/unit/reducers.test.ts` literals.
- Message components are one-file-per-kind: `ChatMessageUser.tsx`, `ChatMessageAnswer.tsx`, `ChatMessageNoMatch.tsx` — currently minimally styled placeholders; Round 3 (Issues 11/12) restyles these files directly (not `ChatTranscript.tsx`, which just maps/dispatches by kind).
- `CollapsiblePanel` gained additive optional props: `forceMount` (content stays mounted, visibility via own CSS `hidden` class, not Radix's) and `shrinkWidthOnCollapse`. Default off; `FolderPanel` unaffected.

**Graph3D (worker-graph3d):**
- `GraphView.tsx` extension points: `fgRef` (ForceGraphMethods — `cameraPosition()`, `zoomToFit()`, `emitParticle()`, `scene()`, etc., guarded `if (!fgRef.current) return`, stays `undefined` under the WebGL-less error-boundary path); `graphData` via `useMemo` off `useGraphState()` — Round 3 should add `nodeColor`/`linkColor`/opacity accessors reading `state.highlightedNodeIds`/`highlightedEdgeIds` from the SAME `useGraphState()` call, not restructure `<ForceGraph3D>`; `handleNodeClick` is currently a no-op wired to `onNodeClick` — Round 4 (Issue 8) wires it to `selectedNodeId`.
- **jsdom/WebGL fix (load-bearing, do not remove):** `GraphSceneErrorBoundary.tsx` wraps `<ForceGraph3D>` because real `WebGLRenderer` construction throws synchronously in jsdom, which broke the frozen `AppShell`/`ThemeProvider` tests (they mount full `<App>`). `useGraphData`'s fetch also has a trailing `.catch(() => {})` for the same reason (no unhandled rejection under un-stubbed fetch).
- Mock pattern for any GraphView-touching test: `vi.mock("react-force-graph-3d", () => ({ default: (props) => { capturedProps = props; return null; } }))` — capture props, assert against them or call captured accessor functions directly.
- Edge styling: `relationTypeToEdgeStyle(relation): EdgeStyle` in `src/lib/edgeStyles.ts` — pure, case/whitespace-insensitive, 5 known relations (`is_a`,`part_of`,`depends_on`,`causes`,`related_to`) + 1 fallback, never throws.
- Scene colors as raw hex in `src/components/graph/sceneColors.ts` (VOID/ION/SYNAPSE) — three.js needs raw values, mirrors `index.css` tokens.

**Folder (worker-folder-input):**
- `useFolderConfig()` → `{ defaultFolder, error, submitting, submit }`. `defaultFolder` doubles as "currently active folder" (kept in sync with `ingestion.state.folderPath`). On every successful GET-prefill or POST-submit: dispatches `RESET_FOLDER` then `STATUS_UPDATE{state:"watching"}`.
- Known gap (not yet handled, no acceptance criterion covers it): a failed initial GET /api/folder-config is silently swallowed (blank input, no error UI). Flag for Round 3/5 if this needs surfacing.
- `FolderPathInput` props: `{defaultFolder, error, onSubmit, submitting?}`. Round 3 (Issue 5) adds `FolderStatusLine` as a sibling inside `FolderPanel`, reading `useIngestionState().state.status` directly — no hook changes needed.

**Environment note:** `tests/setup.ts`'s `mockFetch` routes by URL substring only, not HTTP method — cannot express "GET succeeds then POST fails then POST succeeds" sequences. Workers needing that stub `fetch` locally in their own test file rather than editing `setup.ts` (established precedent, keep following it).

## D8 — Round 3 interfaces established (Round 4 builds directly on these)

**Graph highlight/camera-follow (worker-traversal):**
- `GraphAction` gained `HIGHLIGHT_NODE{nodeId, edgeId?}` (additive to `highlightedNodeIds`/`highlightedEdgeIds`, dedup'd) and `CLEAR_HIGHLIGHT` (empties both). `graphReducer.ts`'s `ADD_NODE`/`SET_GRAPH`/`RESET_GRAPH` bodies are byte-for-byte unchanged.
- `GraphView.tsx` now exports a module-level `graphCameraControls: {current: GraphCameraControls | null}` ref seam (`GraphCameraControls = {focusNode(nodeId): void}`), registered by `GraphView` on mount/unmount. This is the camera-follow call-through for any hook outside the component tree (chosen over a `useEffect` inside `GraphView` specifically so `useTraversalSync` is unit-testable without a real WebGL scene). Round 4 should reuse this seam rather than inventing a second one.
- Node highlighting could NOT route through the frozen `nodeGlow.ts`/`nodeThreeObject` (it ignores its node argument — uniform styling only). Instead there's a parallel, self-contained highlight-sprite system directly in `GraphView.tsx` (`highlightSpritesRef`, `buildHighlightSprite`, `getHighlightTexture`) added/removed reactively off `state.highlightedNodeIds`, guarded by `fgRef.current` same as the existing fog effect. **Unverified in a real browser** (no headless/screenshot tool in this sandbox) — flagged for a manual look before shipping, not just a formality.
- `useTraversalSync()` is mounted from `ChatTranscript.tsx` (not `ChatPanel.tsx`, which wasn't in that worker's owned-files list) — relies on `ChatTranscript` already being inside `ChatPanel`'s `forceMount`ed content to survive collapse. Must only ever be mounted once (module-level refs, not designed for multiple instances).
- **Real gap, not hypothetical:** `AnswerMessage`/`NoMatchMessage` carry no `queryId` (frozen `useChatSession.ts` never attaches one to `ADD_MESSAGE`). `ChatTranscript` pairs traces to messages **positionally** (a `traceCursor` incremented on every answer/no_match), which only holds because only one query can be in flight at a time (`activeQueryId` enforced client-side). If concurrent queries are ever allowed, `useChatSession.ts` needs to thread a real `queryId` through and this pairing needs to be revisited.

**Ingestion status / folder switch (worker-folder-live):**
- `useIngestionStatus()` polls `GET /api/graph` every 2500ms once `folderPath` is set, diffs node-id sets: growth → `extracting` (no `file`, backend has no per-file event), no growth after growth was seen → `idle`, no growth ever seen yet → `watching` (baseline). `file`/`queued` are ALWAYS omitted — there is no real backend data for either; do not fabricate them in any later round without a real backend surface to back it.
- `useFolderSwitch()` returns the exact same shape as `useFolderConfig()` (`{defaultFolder, error, submitting, submit}`) and additionally dispatches `RESET_GRAPH`+`RESET_SESSION` via a `useEffect` watching `ingestionState.folderPath` for a non-null→different-non-null transition — NOT a submit-callback wrapper, because `useFolderConfig`'s `submit` (frozen) swallows all errors internally and returns no success/failure signal.
- Both hooks are mounted at the top of `FolderPanel.tsx` (above the `CollapsiblePanel`), so their intervals/effects survive folder-panel collapse even though `FolderPathInput`/`FolderStatusLine` themselves unmount/remount (state lives in Context, unaffected).

**Sandbox environment note:** `npx vitest run` intermittently produces a single `[vitest-pool-runner]: Timeout waiting for worker to respond` on an unrelated file under CPU load (seen across Rounds 2 and 3, on different files each time) — confirmed non-deterministic infra flakiness, not a real test failure, by re-running the implicated file alone. Always re-run an isolated failing file before treating a red run as real.

## D9 — Round 4 interfaces established (final feature round — Phase 7 integration builds on this state)

**Node fade-in / HUD overlay (worker-graphfx):**
- `GraphAction` gained `ADD_EDGES{edges}` (additive concat) and `SELECT_NODE{nodeId: string|null}` (sets `selectedNodeId`). `graphReducer.ts`'s prior cases (`ADD_NODE`/`SET_GRAPH`/`RESET_GRAPH`/`HIGHLIGHT_NODE`/`CLEAR_HIGHLIGHT`) are byte-for-byte unchanged.
- `useNodeFadeIn()` runs its OWN independent 2500ms poll of `GET /api/graph` (deliberately not sharing a timer with `useIngestionStatus`), dispatching `ADD_NODE`/`ADD_EDGES` only — never `SET_GRAPH` — so existing nodes/positions are never disturbed. Mounted once, inside `GraphView` itself.
- Node pop-in is **scale-only** (`easeOutBack` curve), not opacity — `nodeGlow.ts`'s core/halo materials are module-level and shared/frozen across every node instance, so per-node opacity was never available. Any later round wanting a different fade treatment needs to either accept scale-only or take on unfreezing `nodeGlow.ts` (a real, deliberate trade-off already made once, not an oversight).
- Reprojection for `NodeDetailOverlay`: `ForceGraphMethods.graph2ScreenCoords(x,y,z)` (confirmed present in the installed library's own `.d.ts`) driven every frame via the `onEngineTick` prop (also confirmed present, fires regardless of physics "cooldown" state). `reprojectNodeToScreen(fg, node)` is an exported pure function in `GraphView.tsx` for exactly this reason — testable without a real WebGL scene.
- **Known gap, explicitly flagged by the worker, not silently decided:** clicking a node dispatches `SELECT_NODE` but there is NO distinct in-scene visual (glow ring/sprite) for "selected" — the HUD overlay itself is the only visible feedback. This is different from Round 3's `HIGHLIGHT_NODE` trail (multi-node, query-scoped, auto-cleared on `CLEAR_HIGHLIGHT`) — the two were deliberately kept separate so a traversal completing doesn't blow away an open HUD overlay. If a later pass wants a dedicated "selected" glow, that's new scope, not a bug fix.
- **Unverified in a real browser** (repeated caveat across every graph-touching round — no headless/screenshot tool exists in this sandbox): the `easeOutBack` pop-in's actual visual quality and the HUD overlay's real-world drift-free anchoring during a manual camera orbit/zoom. Both are implemented per spec and covered by mocked/pure-function tests, but a manual look in a real browser is recommended before calling the futuristic-graph centerpiece fully validated.
- No `prefers-reduced-motion` guard on the three.js scale animation (Round 3's CSS `animate-pulse` had a free `motion-safe:` variant; there's no equivalent one-line primitive for an imperative `THREE.Object3D.scale` mutation) — flagged as a possible accessibility follow-up, not added speculatively.

**All 14 issues in `docs/frontend/issues.md` are now implemented as of end of Round 4.**

## Round history

- 2026-07-06: Phases 1-2 complete; Round 1 brief being written.
- 2026-07-06: Round 1 shipped and independently reverified. Round 2 (realtime-chat, folder-input, graph3d) shipped in parallel with zero file conflicts; independently reverified post-merge (11/11 files, 34/34 tests, tsc clean, build clean). Round 3 briefs (traversal: 10/11/12; folder-live: 5/14) being written next.
- 2026-07-06: Session-limit interruption hit mid-Round-3 with zero code written by either worker — clean relaunch, no reconciliation needed. Round 3 shipped (traversal + folder-live in parallel); both workers initially paused on self-spawned background verification instead of reporting synchronously, then completed properly on resume. Independently reverified: 18-19/19 files passing depending on run (isolated flaky-file re-runs confirmed clean each time), tsc clean, build clean. Round 4 (worker-graphfx: Issues 7, 8) next.
- 2026-07-06: Round 4 (sole worker, final feature round) shipped clean on first attempt, full synchronous verification in the same turn. Independently reverified: one run hit the known single-file flaky timeout pattern, a clean re-run confirmed 22/22 files, 62/62 tests, tsc clean, build clean. All 14 issues now implemented. Phase 7 (integration) brief being written next: full suite gate + Playwright e2e best-effort against the real backend + SHIPPED decision.
- 2026-07-06: **Phase 7 (integration) DONE — SHIPPED ✓.** Gate (vitest 22/22, tsc, build) green on first attempt, independently reverified by the orchestrator a final time (same numbers). Integration audit found the full cross-round chain live and coherent, no fixes needed. E2E: attempted for real against the actual backend (not skipped) — found two independent, verified, out-of-frontend-scope blockers: (1) Playwright's Chromium binary can't launch in this sandbox (missing system libs, no sudo for `--with-deps`); (2) the backend's configured free-tier OpenRouter models (`nvidia/nemotron-3-ultra-550b-a55b:free` / `nvidia/llama-nemotron-embed-vl-1b-v2:free`) return empty content for the ingestion/embedding prompts (verified via direct curl that the models/keys/network work fine for trivial prompts — this is prompt/model-specific, not infra), and a live `/ws/chat` query hangs with no event ever emitted. Both documented as manual-verification follow-ups rather than forced or silently skipped. Fixture docs for a future E2E attempt live at `docs/frontend/tests/e2e/fixtures/sample-docs/`. **This is the final entry — the frontend build is complete.**

## Post-ship follow-ups (not blocking, for whoever picks this up next)

1. Swap `.env`'s `OPENROUTER_LLM_MODEL`/`OPENROUTER_EMBED_MODEL` for models confirmed to return non-empty content for the backend's actual extraction/embedding prompts (or investigate the reasoning-token-budget theory in worker-integration-report.md), then re-attempt E2E on a machine with real Chromium system deps.
2. Manual real-browser check recommended for: the `easeOutBack` node pop-in's visual quality, the HUD overlay's drift-free anchoring during real camera orbit/zoom, and the highlight-sprite trail from Round 3 — all implemented per spec and covered by mocked/pure-function tests, but never rendered in an actual browser (no headless/screenshot tool existed in this sandbox).
3. If concurrent chat queries are ever allowed, `useChatSession.ts` needs to thread a real `queryId` through `ADD_MESSAGE` — the current trace/message pairing in `ChatTranscript.tsx` is positional and only holds under the current one-query-at-a-time constraint.
4. Consider a dedicated in-scene "selected" glow distinct from the HUD overlay itself (currently the only selection feedback) — flagged by worker-graphfx as a real gap, not a bug.
5. `useFolderConfig`'s failed initial GET /api/folder-config is silently swallowed (blank input, no error UI) — no acceptance criterion ever covered this path across 4 rounds; worth a small dedicated fix if it matters in practice.

## Folder-selection rework + generating overlay (2026-07-09)

Frontend half of `docs/superpowers/plans/2026-07-06-folder-selection-rework.md`. The folder panel's absolute-path text input is gone; folder selection is now a drag-and-drop zone + a server-side browser modal, and the graph viewport shows a live "generating" overlay during ingestion.

**New endpoints consumed:** `GET /api/browse` (browser modal), `POST /api/ingest/upload` (drop/picker upload), `GET /api/ingest-status` (generating-overlay poll — real backend thread-liveness signal, NOT a node-count heuristic).

**Deleted:** `FolderPathInput.tsx` + its unit test (the only intentional deletions). `useFolderConfig`/`useFolderSwitch` remain — the browse modal's Select still submits through the existing folder-config flow.

**New pieces:**
- `lib/folderUpload.ts` (pure): `collectFilesFromDataTransfer` (recursive `webkitGetAsEntry` walk; returns `{folderName, entries}`, empty for non-directory drops), `collectFilesFromInput` (`webkitRelativePath` mapping), `filterSupported` (.md/.txt/.pdf, case-insensitive). Relative paths are rooted INSIDE the dropped folder; the folder's own name travels separately as `folder_name`.
- `useFolderUpload` — FormData POST to `/api/ingest/upload`; success dispatches `RESET_FOLDER` + `STATUS_UPDATE watching`, which makes `useFolderSwitch` fire `RESET_GRAPH`/`RESET_SESSION`/`GENERATING_START` exactly as a browse switch does.
- `useBrowse` + `FolderBrowserModal` (glass HUD modal: path readout, dir list, Up/Home, Windows drive chips).
- `FolderDropZone` + `FolderSourceBadge`; `FolderPanel` tracks `mode: "linked" | "uploaded"` locally — badge semantics: **"Linked folder"** (browse/prefill: the watcher tracks the real folder live) vs **"Uploaded copy · re-drop to refresh"** (upload: the watcher watches the server-side copy; re-dropping is the refresh mechanism — accepted tradeoff, the browser can never reveal a dropped folder's absolute path).
- Graph state: `generating: boolean` + `GENERATING_START`/`GENERATING_END`; set on genuine folder switch, cleared by `useGeneratingStatus` (1500ms poll of `/api/ingest-status`, mounted in `GraphView` since the center pane never unmounts).
- `GeneratingOverlay` (Task 9, frontend-design skill): pointer-events-none scanning overlay — sonar ping of expanding ion rings (signature element), deterministic drifting ion/synapse particles, `:: Ingesting folder` mono eyebrow, "Generating graph" headline, live tabular-nums "`{n}` concepts discovered" counter, edge vignette so materializing nodes stay visible. Keyframes live in `index.css` ("Generating overlay animations" section), disabled under `prefers-reduced-motion`. Empty-state hint is suppressed while generating and now reads "No graph loaded yet — drop a folder to begin."
