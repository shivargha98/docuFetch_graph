### Status
COMPLETE

### What I Built

**New hooks**
- `src/hooks/useWebSocket.ts` (101 lines) — manages the `/ws/chat` connection lifecycle: connects once `ingestionState.folderPath` is non-null, dispatches `CONNECTION_STATUS` ("connecting" → "connected" / "error" / "disconnected") into ingestion state, and auto-reconnects after an unexpected close with exponential backoff (1s → doubling → capped at 10s). Exposes `{ send, setOnMessage }`. Readiness is tracked via a local `isOpenRef` (not `socket.readyState`/`WebSocket.OPEN`) since the mocked `FakeWebSocket` in `tests/setup.ts` doesn't implement the `WebSocket.OPEN` static constant or update `readyState` on `emitOpen()`.
- `src/hooks/useChatSession.ts` (141 lines) — composes `useWebSocket`, submits `{ query }` frames, appends `user` messages to the transcript, and maps incoming frames to dispatches: `visit_node → TRACE_STEP` (`node_id→nodeId`, `via_relation→viaRelation`), `traversal_complete → TRACE_COMPLETE`, `answer`/`no_match → ADD_MESSAGE` (+ `QUERY_END`), `error → QUERY_END` only (socket stays open per contract, no transcript entry added — see assumptions below). Enforces no-overlapping-queries by checking the active query id before sending.

**Chat panel components** (`src/components/chat/`, all new)
- `ChatPanel.tsx` (42 lines) — replaces the Round 1 placeholder. Calls `useChatSession()` at its own top level (see "Hook mounting" below), renders `ConnectionStatusChip` + `ChatTranscript` + `ChatInput` inside `CollapsiblePanel`, opting into the new `forceMount` and `shrinkWidthOnCollapse` props. Keeps `data-testid="chat-panel"`.
- `ChatTranscript.tsx` (37 lines) — maps `messages` to per-kind components, `data-testid="chat-transcript"`.
- `ChatMessageUser.tsx` / `ChatMessageAnswer.tsx` / `ChatMessageNoMatch.tsx` (19/19/20 lines) — one file per message kind, minimally styled per the brief (Round 3 restyles these independently).
- `ChatInput.tsx` (48 lines) — controlled text input + submit button, disabled while `queryInProgress`, empty submissions are a no-op, clears on submit.
- `ConnectionStatusChip.tsx` (36 lines) — small pill showing live connection status (`data-testid="connection-status-chip"`, `data-status="..."`), mono font, colored per status using only existing theme tokens (ion/synapse/muted/text-secondary).

**Additive edits to shared/frozen-adjacent files**
- `src/state/types.ts` — added `ChatState.activeQueryId?: string | null` (made **optional**, not required — see assumption below), `ChatAction` gained `QUERY_START` / `QUERY_END`; `IngestionAction` gained `CONNECTION_STATUS`.
- `src/state/chatReducer.ts` — `initialChatState` now includes `activeQueryId: null`; added `QUERY_START`/`QUERY_END` cases.
- `src/state/ingestionReducer.ts` — added `CONNECTION_STATUS` case (`{ ...state, connectionStatus: action.status }`).
- `src/components/ui/CollapsiblePanel.tsx` — added two new optional props, both defaulting to `false`/unchanged behavior:
  - `forceMount` — content stays mounted (visually hidden via our own CSS, not Radix's) instead of unmounting on collapse.
  - `shrinkWidthOnCollapse` — appends `md:w-auto` to the Root's className when collapsed, overriding any fixed width passed via `className` (tailwind-merge resolves the conflict, last class wins).
  - Also added `data-testid={testId ? `${testId}-content` : undefined}` on `Collapsible.Content` (purely additive, used by my collapse test and potentially useful for Round 3).
  - Verified the 2 existing `CollapsiblePanel.test.tsx` tests and the folder panel's usage are unaffected (both new props default off; `FolderPanel.tsx` was not touched).

**Tests** (copied from `docs/frontend/tests/integration/` and fully implemented)
- `tests/integration/useWebSocket.test.tsx` (144 lines, 4 tests)
- `tests/integration/useChatSession.test.tsx` (140 lines, 3 tests)
- `tests/integration/ChatPanelCollapse.test.tsx` (169 lines, 3 tests)

### Final Shape of New/Changed State (verbatim)

```ts
// state/types.ts
export interface ChatState {
  messages: ChatMessage[];
  traces: Trace[];
  activeQueryId?: string | null;
}

export type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "TRACE_STEP"; queryId: string; step: TraceStep }
  | { type: "TRACE_COMPLETE"; queryId: string }
  | { type: "RESET_SESSION" }
  | { type: "QUERY_START"; queryId: string }
  | { type: "QUERY_END" };

export type IngestionAction =
  | { type: "STATUS_UPDATE"; status: IngestionStatus }
  | { type: "RESET_FOLDER"; folderPath: string }
  | { type: "CONNECTION_STATUS"; status: ConnectionStatus };
```

```ts
// hooks/useWebSocket.ts
export interface UseWebSocketResult {
  send: (data: unknown) => void;
  setOnMessage: (handler: ((data: unknown) => void) | null) => void;
}
export function useWebSocket(): UseWebSocketResult;

// hooks/useChatSession.ts
export interface UseChatSessionResult {
  messages: ChatMessage[];
  submit: (text: string) => void;
  queryInProgress: boolean;
  connectionStatus: ConnectionStatus;
}
export function useChatSession(): UseChatSessionResult;
```

### WS Event → Dispatch Mapping (in `useChatSession`)

| Incoming frame | Dispatch(es) |
|---|---|
| `{ type: "visit_node", node_id, concept, hop, via_relation }` | `TRACE_STEP` with `{ queryId: activeQueryId, step: { nodeId: node_id, concept, hop, viaRelation: via_relation } }` (no-op if no active query) |
| `{ type: "traversal_complete", ... }` | `TRACE_COMPLETE` with `{ queryId: activeQueryId }` (no-op if no active query) |
| `{ type: "answer", text }` | `ADD_MESSAGE` (`{ kind: "answer", id: uuid, text }`) then `QUERY_END` |
| `{ type: "no_match", message }` | `ADD_MESSAGE` (`{ kind: "no_match", id: uuid, message }`) then `QUERY_END` |
| `{ type: "error", message }` | `QUERY_END` only (releases the input; no transcript entry — Round 3 may want to surface this visibly, see assumptions) |

On `submit(text)`: trims, no-ops if empty or a query is already active, else generates a client-side `queryId` (`crypto.randomUUID()`), dispatches `ADD_MESSAGE` (user) and `QUERY_START`, then `send({ query: text })`.

### Hook Mounting (survives panel collapse)

`useChatSession()` (and transitively `useWebSocket()`) is called at the **top level of `ChatPanel`** — the component that is unconditionally, permanently mounted by `App.tsx`. It is *not* called inside anything passed as `children` to `CollapsiblePanel`. Only the JSX markup for `ConnectionStatusChip`/`ChatTranscript`/`ChatInput` is nested inside the collapsible content; the hook state itself (socket ref, reconnect timer, chat/ingestion Context) lives one level up and is completely unaffected by whatever `CollapsiblePanel` does internally on collapse. This means events keep flowing and dispatching to Context regardless of collapse state, which is what Test 3 in `ChatPanelCollapse.test.tsx` verifies via a `TraceProbe` component rendered as a sibling of `ChatPanel` (not inside it), reading `useChatState()` directly.

### CollapsiblePanel Approach Chosen (scroll restoration)

Went with **option (a) from the brief**: additive `forceMount` prop, rather than manually saving/restoring `scrollTop`. Investigated Radix's actual `forceMount` semantics by reading `node_modules/@radix-ui/react-collapsible/dist/index.mjs` and `@radix-ui/react-presence`: passing Radix's own `forceMount` prop makes `present = forceMount || context.open` permanently `true`, which (per Presence's state machine) makes Radix's own `isOpen`/`hidden` bookkeeping *always report open* — i.e. Radix's built-in "hidden" mechanism cannot be trusted once `forceMount` is set. So the visibility toggle is done entirely with our own CSS: `Collapsible.Content`'s `className` gets a `hidden` Tailwind class appended based on **our own** local `open` state (`forceMount && !open && "hidden"`), independent of anything Radix computes internally. The DOM node itself (and everything under it, including the transcript's scrollable container) is never unmounted, so `scrollTop` naturally persists across a collapse/re-expand cycle with no extra bookkeeping. `ChatPanel` opts in via `forceMount` + `shrinkWidthOnCollapse`; `FolderPanel` (not touched) still gets the original default (`forceMount=false`), i.e. unmount-on-collapse, unchanged.

### Test Results

Ran `cd /workspace/frontend && npx vitest run` (full suite, shared directory with 2 other parallel workers actively editing files):
```
Test Files  11 passed (11)
     Tests  34 passed (34)
```
My 3 files specifically (also verified in isolation, twice, for stability):
```
tests/integration/useWebSocket.test.tsx        4/4 PASS
tests/integration/useChatSession.test.tsx      3/3 PASS
tests/integration/ChatPanelCollapse.test.tsx   3/3 PASS
```
`npx tsc -b` — clean, no output.
`npm run build` — succeeded:
```
dist/index.html                     0.80 kB │ gzip:   0.43 kB
dist/assets/index-rWPpY2v6.css     13.53 kB │ gzip:   3.57 kB
dist/assets/index-D1DE-NuI.js   1,627.77 kB │ gzip: 447.97 kB
✓ built in 16.60s
```
(The >500kB chunk-size warning is from `three`/`react-force-graph-3d`, the graph3d worker's dependency — not something I introduced or can address within my file ownership.)

**Flakiness observed (not caused by my code):** two full-suite runs during verification had one unrelated test file (`tests/unit/reducers.test.ts` once, `tests/unit/GraphEdgeStyling.test.ts` once) fail only with `[vitest-pool-runner]: Timeout waiting for worker to respond` — a worker-process timeout from CPU contention with the other two workers' concurrent `vitest`/`vite build` runs, not a real test failure. Both files pass cleanly in isolation (verified `reducers.test.ts` standalone: 8/8 pass). No file I own or edited was ever implicated in these timeouts.

### What the Orchestrator Should Know

- **Assumption (flagged as load-bearing):** the brief suggested `ChatState.activeQueryId: string | null` as a required-looking field, but the frozen `tests/unit/reducers.test.ts` constructs `ChatState` object literals (e.g. `{ messages: [...], traces: [...] }`) without it. Making it required would break `tsc -b` on that frozen test file. I made it **optional** (`activeQueryId?: string | null`) instead — `initialChatState` still sets it to `null`, and all my own code treats a missing value as `null`/not-in-flight. This preserves the frozen test file exactly as-is while still satisfying the brief's intent.
- **Query ids are entirely client-generated** (`crypto.randomUUID()`), since none of the backend WS frames (`visit_node`, `traversal_complete`, `answer`, `no_match`) carry a query/session identifier. This works because only one query can be in flight at a time (enforced by `activeQueryId`), so trace events are unambiguously attributed to the current `activeQueryId` at the time they arrive.
- **`error` frames do not add a transcript entry**, only `QUERY_END` (to unstick the input). The brief only specified `ADD_MESSAGE` for `answer`/`no_match`; I judged silently releasing the lock (rather than inventing an error-message UI not requested) as the minimal-scope interpretation. Flagging this explicitly in case Round 3 wants a visible error state.
- **Reconnect backoff** is a simple exponential scheme (1s, 2s, 4s, 8s, capped at 10s), reset to 1s on every successful `onopen`. Not configurable — no such requirement in the brief.
- Discovered and worked around a real Radix behavior gotcha with `forceMount` (see "CollapsiblePanel Approach" above) that isn't obvious from the Radix docs — worth remembering if any later round touches `CollapsiblePanel` again.
- I did **not** touch `App.tsx`, `vite.config.ts`, `tsconfig*`, `src/index.css`, `src/components/folder/**`, `src/components/graph/**`, `src/state/graphReducer.ts`, `src/state/providers.tsx`, `tests/setup.ts`, or any `tests/unit/**` file, per the frozen list.
- The shared `/workspace/frontend` directory is being edited live by two other parallel workers (folder-input, graph3d) — file counts and test totals shifted between my verification runs (e.g. new files `useFolderConfig.ts`, `useGraphData.ts`, `sceneColors.ts`, `edgeStyles.ts`, `nodeGlow.ts` appeared mid-session). None of this affected my files or my test results.

### What the Next Worker Needs

- **Round 3 (traversal/answer UI worker):** the trace/answer plumbing is already fully wired —`ChatState.traces` accumulates `TraceStep[]` per `queryId` via `useChatSession`, and `messages` already contains `answer`/`no_match` entries. You only need to restyle:
  - `src/components/chat/ChatMessageAnswer.tsx`, `ChatMessageNoMatch.tsx`, `ChatMessageUser.tsx` — one file per kind, as requested.
  - Add a new component to render `ChatState.traces` (live reasoning-path view) — nothing currently renders `traces` visually; `TraceProbe` in my `ChatPanelCollapse.test.tsx` is test-only, not a real component.
  - `useChatSession()` returns `{ messages, submit, queryInProgress, connectionStatus }` — call it once from wherever you need this data (or read `useChatState()`/`useIngestionState()` directly, both already carry everything).
- **Any worker needing connection status elsewhere:** `useIngestionState().state.connectionStatus` is a `ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"`, kept live by `useWebSocket` (mounted once, inside `ChatPanel`). Don't mount a second `useWebSocket()` elsewhere — it would open a second competing socket.
- **`CollapsiblePanel`'s new props** (`forceMount`, `shrinkWidthOnCollapse`, and the `${testId}-content` testid) are available to any consumer; both default to `false`/off so existing usages (`FolderPanel`) are unaffected unless explicitly opted in.

### Blockers

None. No dependency files were required for this brief (Round 1 foundation was already complete and verified before I started). All 3 assigned test files pass, `tsc -b` is clean, and `npm run build` succeeds.
