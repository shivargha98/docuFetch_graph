# Worker Brief: realtime-chat (Round 2 — Issues 3, 9, 13)

You are one of THREE workers running in parallel directly in `/workspace/frontend` (no worktree). The others own the folder panel and the graph view. **Touch ONLY the files listed under "Files you own"** — editing anything else will clobber a parallel worker.

Foundation (Round 1) is done and verified. Read `/workspace/docs/frontend/agent-reports/worker-foundation-report.md` FIRST — it contains the exact state types, provider hooks, theme tokens, and test-fixture APIs you must build against. Do not re-derive or re-invent any of it.

## Backend WS contract (FINAL — from /workspace/backend/api/ws_routes.py)

Endpoint `ws://<host>/ws/chat` (dev-proxied: connect to `ws://${location.host}/ws/chat`; the Vite proxy forwards `/ws` to the backend). Protocol per query:
- Client sends `{"query": "<text>"}` (JSON).
- Server streams: `{"type":"visit_node","node_id","concept","hop","via_relation"}` per step → `{"type":"traversal_complete","nodes_visited","hops_used"}` → exactly one of `{"type":"answer","text"}` or `{"type":"no_match","message"}`.
- Errors: `{"type":"error","message"}` — the socket STAYS OPEN and serves the next query.
- One socket serves many sequential queries; do not reconnect per query.

## Issue 3 — WebSocket connection lifecycle

Build a `useWebSocket` hook (`src/hooks/useWebSocket.ts`) managing connect / unexpected-disconnect / automatic reconnect (backoff), surfacing status into the ingestion slice's `connectionStatus`.

Acceptance criteria:
- On app load with a folder configured (ingestion state `folderPath` non-null — the folder worker guarantees this gets set from GET /api/folder-config prefill; in your tests, seed the state yourself), a connection attempt is made and its result (connected/failed) is reflected in app state.
- An unexpected disconnect updates `connectionStatus` to a visibly indicated "disconnected" state (render the indicator inside YOUR chat panel — e.g. a subtle status chip; do not touch other panels).
- Reconnection is attempted automatically after an unexpected disconnect (use a timer/backoff; tests advance fake timers).

**Required additive state change (you are the ONLY worker allowed to edit these files this round):** add `{ type: "CONNECTION_STATUS"; status: ConnectionStatus }` to `IngestionAction` in `src/state/types.ts` and handle it in `src/state/ingestionReducer.ts`. Additive only — existing actions, fields, and the passing `tests/unit/reducers.test.ts` must remain untouched and green.

## Issue 9 — Chat query submission and transcript

Chat input + submit flow in the chat panel: sending `{"query": text}` over the active socket, appending a `user` message to the transcript (via `ADD_MESSAGE`), rendering the transcript list.

Acceptance criteria:
- Submitting a non-empty question sends it over the active WebSocket and appends it to the visible transcript.
- Input is disabled while a query is in flight (from send until `answer`/`no_match`/`error` arrives) — no overlapping queries.
- Submitting an empty question is a no-op (nothing sent, no transcript entry).

You will need an in-flight flag: add it to `ChatState` (e.g. `activeQueryId: string | null` or `queryInProgress: boolean`) with additive actions in `chatReducer.ts`/`types.ts` (same additive-only rule). While in flight, also dispatch `TRACE_STEP`/`TRACE_COMPLETE` from incoming `visit_node`/`traversal_complete` events (map `node_id→nodeId`, `via_relation→viaRelation`) and dispatch `ADD_MESSAGE` for `answer`/`no_match` — Round 3 builds the trace/answer UI on top of exactly this state, so wire the event→dispatch plumbing now (a hook like `useChatSession` in `src/hooks/useChatSession.ts`). Keep transcript rendering simple this round: user messages styled; answer/no_match messages may render as plain minimal entries (Round 3 restyles them — put each message kind in its own small component file under `src/components/chat/` so Round 3 edits only those).

## Issue 13 — Collapsible chat panel

Acceptance criteria:
- Collapsing the chat panel hides it and lets the graph view expand into the freed width (flexbox handles this if your collapsed panel shrinks; keep the shell classes untouched).
- Re-expanding restores the transcript AND its scroll position.
- An in-progress traversal keeps updating state while collapsed (state lives in Context, so events must keep flowing — ensure your WS/session hooks are NOT mounted inside the part that unmounts on collapse), and shows correctly on re-expand.

Gotcha found in Round 1: `CollapsiblePanel` UNMOUNTS its content on collapse (Radix default). Scroll restoration therefore needs either (a) an additive `forceMount`+CSS-hide option on `CollapsiblePanel` (you have sole additive edit rights to `src/components/ui/CollapsiblePanel.tsx`; default behavior and its 2 passing unit tests must not change — the folder panel relies on them), or (b) saving/restoring scroll offset around unmount. Your choice; document it.

## Files you own (complete list — nothing else)

- `src/hooks/useWebSocket.ts`, `src/hooks/useChatSession.ts` (new)
- `src/components/chat/**` (replace ChatPanel placeholder internals; keep `data-testid="chat-panel"` and the CollapsiblePanel wrapper pattern; add message/input subcomponents)
- Additive edits: `src/state/types.ts`, `src/state/chatReducer.ts`, `src/state/ingestionReducer.ts`, `src/components/ui/CollapsiblePanel.tsx`
- Tests you copy from `/workspace/docs/frontend/tests/integration/` into `/workspace/frontend/tests/integration/` and implement: `useWebSocket.test.tsx`, `useChatSession.test.tsx`, `ChatPanelCollapse.test.tsx`

FROZEN (do not touch): package.json (no new deps — everything you need is installed), vite.config.ts, tsconfig*, src/index.css, src/App.tsx, src/components/folder/**, src/components/graph/**, src/state/graphReducer.ts, src/state/providers.tsx, tests/setup.ts, tests/unit/**. If you believe a frozen file must change, STOP that change, note it in your report, and work around it.

## Styling

Use the existing theme tokens only (ion/synapse accents, muted, glass-panel, glow shadows, mono font for telemetry like connection status — see foundation report token table). No design-skill invocation required for this brief (behavioral issues); Round 3 does the chat message visual treatment.

## Testing notes

- Use `mockWebSocket()` from `tests/setup.ts` — handle has `emitOpen/emitMessage/emitClose/emitError` plus `instances[]` (inspect `instances.at(-1).sent` for sent frames). Use `mockFetch` only if you need it. Use vitest fake timers for reconnect backoff.
- Each stub's doc comment defines the behavior to assert; adapt mechanics to your implementation.
- Existing 15 tests must stay green.

## Verification (synchronous — never end your turn waiting on a background run)

1. `cd /workspace/frontend && npx vitest run` — all files pass (15 existing + your 3 new files).
2. `npx tsc -b` clean. 3. `npm run build` succeeds.
Paste real output numbers in the report.

## Report — /workspace/docs/frontend/agent-reports/worker-realtime-chat-report.md

Include: files created/edited (flag every additive edit to shared files with exactly what was added), the final shape of new state fields/actions (verbatim TS — Round 3's traversal worker builds on your chat state), how WS events map to dispatches, where hooks are mounted (and why that survives panel collapse), the CollapsiblePanel approach chosen, test/typecheck/build results, deviations, gotchas for Round 3.
