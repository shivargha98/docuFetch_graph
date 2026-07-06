# Worker Brief: traversal (Round 3 — Issues 10, 11, 12)

You are one of TWO workers running in parallel directly in `/workspace/frontend` (no worktree) this round. The other (`worker-folder-live`) owns folder-status/switch logic and does NOT touch graph or chat component files — you have exclusive edit rights to `GraphView.tsx` and the chat message components this round. **Touch only the files listed under "Files you own".**

Read these worker reports FIRST (they define the exact interfaces you build on — do not re-derive or guess):
- `/workspace/docs/frontend/agent-reports/worker-realtime-chat-report.md` — `useChatSession`, `ChatState.traces` (already fully populated by `TRACE_STEP`/`TRACE_COMPLETE`, nothing renders it yet — that's your job), message component file layout.
- `/workspace/docs/frontend/agent-reports/worker-graph3d-report.md` — `GraphView`'s extension points: `fgRef` (camera control), `graphData` memo off `useGraphState()`, the `vi.mock("react-force-graph-3d", ...)` jsdom test pattern (WebGL doesn't exist in jsdom — you MUST use this mock pattern, not the real renderer, in your tests).

## MANDATORY FIRST STEP — design skill

The user explicitly demands the UI look **absolutely futuristic**; this issue is the "watch the LLM fetch data" payoff — the single most important visual moment in the app. Before writing any highlight/animation/message-styling code, invoke the `frontend-design:frontend-design` skill and apply it. Anchor to existing tokens (ion `#6ee7f9`, synapse `#b389ff`, muted `#7c8699`, glow shadows) — do not invent a new palette.

## Backend WS contract reminder (already wired by Round 2 — you consume state, not the socket)

`useChatSession` already dispatches, per incoming frame: `visit_node → TRACE_STEP{queryId, step:{nodeId,concept,hop,viaRelation}}`, `traversal_complete → TRACE_COMPLETE{queryId}`, `answer/no_match → ADD_MESSAGE`. You do NOT touch the WebSocket or `useChatSession` — you consume `ChatState.traces` and `ChatState.messages` and drive the graph off the same events via a new hook.

## Issue 10 — Live traversal trace and graph highlight sync

Build `useTraversalSync` (`src/hooks/useTraversalSync.ts`): watches `ChatState.traces` for the active (non-collapsed) trace and, for each new `TraceStep` appended, dispatches a graph-highlight action (new, additive — see below) and drives camera-follow via the graph's `fgRef`. Since `fgRef` lives inside `GraphView`, either (a) lift camera-follow logic into `GraphView` itself by having it react to `graphState.highlightedNodeIds` changes (a `useEffect` watching the last-highlighted node id and calling `fgRef.current?.cameraPosition(...)`), or (b) expose a small imperative camera-follow function from `GraphView` via a ref/context seam. Your call — document which you chose.

**Required additive state (you have sole edit rights to graph-state files this round):** `GraphAction` currently only has `ADD_NODE | SET_GRAPH | RESET_GRAPH`. Add whatever's needed to drive `highlightedNodeIds`/`highlightedEdgeIds` (already-existing fields on `GraphState`) — e.g. `HIGHLIGHT_NODE{nodeId}` (appends to the highlighted-ids list, doesn't replace it, so the trail stays visible) and `CLEAR_HIGHLIGHT` (fired on `TRACE_COMPLETE`). Additive only — do not touch `ADD_NODE`/`SET_GRAPH`/`RESET_GRAPH`'s existing behavior or break `tests/unit/reducers.test.ts` (frozen, must stay green untouched).

Acceptance criteria:
- Each traversal-step event both updates the chat trace block (new concept appended) and highlights the corresponding node/edge in the graph, in event order.
- Camera pans/zooms toward each newly visited node (not an instant jump, not static) — use `fgRef.current.cameraPosition({x,y,z}, lookAt, transitionMs)` (three.js/react-force-graph-3d's built-in tweened camera move — do not hand-roll one).
- Once `TRACE_COMPLETE` fires, highlighting/camera-follow stops and that query's trace collapses into an expandable "show reasoning path" summary (dispatch/consume the existing `TRACE_COMPLETE` → `trace.collapsed = true`, already wired by Round 2's `chatReducer`).
- Expanding a collapsed trace reveals its full visited-concept sequence; multiple past queries retain independently expandable state (per-trace local UI state, not global — see TraceBlock below).

Build `TraceBlock` (`src/components/chat/TraceBlock.tsx`) per `docs/frontend/tests/unit/TraceBlock.test.tsx`: props take a `Trace` (steps + collapsed flag). While `!collapsed`, render the live ordered sequence of visited concepts. Once `collapsed`, render a compact "show reasoning path" summary control; clicking it expands **that instance only** (own local `useState`, not shared state) to reveal the full sequence. Multiple `TraceBlock` instances in the transcript must not interfere with each other's expand state.

Wire `TraceBlock` into the transcript: it renders above each `answer`/`no_match`-adjacent trace... actually per the no-match rule below, NO trace renders alongside a no-match message — only alongside answers. Render `TraceBlock` for the trace matching a message's `queryId` immediately above `ChatMessageAnswer`, and do NOT render one above `ChatMessageNoMatch`. You will likely add a small wrapper/grouping component in `ChatTranscript.tsx` (owned by you this round) to pair each trace with its answer.

## Issue 11 — Answer display

Restyle `src/components/chat/ChatMessageAnswer.tsx` (already exists, minimal placeholder from Round 2): render the answer text as its own chat entry beneath that query's collapsed trace summary, using the normal (non-muted) accent styling — this is the "real answer" visual treatment (ion accent, glow per the design skill's direction).

## Issue 12 — No-match message display

Restyle `src/components/chat/ChatMessageNoMatch.tsx`: visually distinct muted/neutral style (use the `--color-muted` token — deliberately unglowing, per the foundation report's design rationale) clearly different from the answer's accent at a glance. No trace block attached (confirm your `ChatTranscript` grouping logic never pairs a trace with a no-match message even if one exists for that `queryId` — per the WS contract a no-match reply still means traversal ran, but the UX intent per the PRD is explicitly no trace shown for no-match).

## Files you own (complete list — nothing else)

- `src/hooks/useTraversalSync.ts` (new)
- `src/components/chat/TraceBlock.tsx` (new)
- `src/components/chat/ChatMessageAnswer.tsx`, `ChatMessageNoMatch.tsx` (restyle existing)
- `src/components/chat/ChatTranscript.tsx` (extend grouping logic to pair traces with answers)
- `src/components/graph/GraphView.tsx` (extend only — add highlight/camera-follow accessors per graph3d's documented extension points; do not restructure the `<ForceGraph3D>` element or remove `GraphSceneErrorBoundary`)
- Additive edits: `src/state/types.ts` (`GraphAction` only), `src/state/graphReducer.ts`
- Tests copied from `/workspace/docs/frontend/tests/` into `/workspace/frontend/tests/` (same relative paths) and implemented: `unit/TraceBlock.test.tsx`, `unit/AnswerMessage.test.tsx`, `unit/NoMatchMessage.test.tsx`, `integration/useTraversalSync.test.tsx`, `integration/GlobalStateCrossPanel.test.tsx`

Note on `GlobalStateCrossPanel.test.tsx`: it has TWO cases — one about folder-switch consistency (Issue 14 territory) and one about a single traversal-step event updating both graph and chat reducers (your territory, Issue 10). Implement BOTH in this file (it's a single shared file, assigned entirely to you to avoid a two-worker file conflict) — the folder-switch case only needs to dispatch already-existing actions (`RESET_GRAPH`, `RESET_SESSION`, `RESET_FOLDER`) across the providers and assert all three panels reflect it; it does not require any new production code from you, just a test exercising existing reducers.

FROZEN (do not touch): package.json, vite.config.ts, tsconfig*, src/index.css, src/App.tsx, `src/hooks/useWebSocket.ts`, `src/hooks/useChatSession.ts`, `src/components/chat/ChatInput.tsx`, `ChatMessageUser.tsx`, `ConnectionStatusChip.tsx`, `src/components/ui/CollapsiblePanel.tsx`, `src/components/folder/**`, `src/hooks/useGraphData.ts`, `src/lib/edgeStyles.ts`, `src/components/graph/nodeGlow.ts`, `src/components/graph/sceneColors.ts`, `src/components/graph/GraphSceneErrorBoundary.tsx`, `src/state/chatReducer.ts`, `src/state/ingestionReducer.ts`, `src/state/providers.tsx`, `tests/setup.ts`, all frozen/prior-round test files. If a frozen file seems to need a change, don't — report it.

## Testing notes (critical)

- Use the `vi.mock("react-force-graph-3d", ...)` capture-props pattern documented in the graph3d report for any test that touches `GraphView` — real WebGL doesn't exist in jsdom.
- `mockWebSocket()`/`resetAllMocks()` from `tests/setup.ts` for `useTraversalSync`/`GlobalStateCrossPanel` per their stub imports.
- Existing 34 tests must stay green.

## Verification (synchronous — never end your turn waiting on a background run)

1. `cd /workspace/frontend && npx vitest run` — everything passes. 2. `npx tsc -b` clean. 3. `npm run build` succeeds. Paste real numbers.

## Report — /workspace/docs/frontend/agent-reports/worker-traversal-report.md

Include: files created/edited (exact additive diffs to `types.ts`/`graphReducer.ts`), the camera-follow mechanism chosen (a or b above) and why, the trace/answer pairing logic in `ChatTranscript`, design decisions made under the frontend-design skill, test/typecheck/build results, deviations, gotchas for Round 4 (which extends `GraphView` again for fade-in + HUD).
