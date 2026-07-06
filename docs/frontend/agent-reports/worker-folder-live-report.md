### Status
COMPLETE

### What I Built

- `src/hooks/useIngestionStatus.ts` (75 lines, new) — polls `GET /api/graph` every 2500ms once `ingestionState.folderPath` is non-null, diffing the returned node-id set between polls to dispatch a derived `STATUS_UPDATE`. Effect is keyed on `[folderPath, dispatch]`, so the interval is torn down and a fresh one started whenever the folder changes.
- `src/components/folder/FolderStatusLine.tsx` (33 lines, new) — pure presentational component, `{ status: IngestionStatus }` in, one `<p data-testid="folder-status-line">` line of mono-font text out. No internal state, no fetching.
- `src/hooks/useFolderSwitch.ts` (41 lines, new) — thin wrapper around `useFolderConfig()`. Returns `useFolderConfig()`'s result unchanged, and additionally runs an effect (keyed on `ingestion.folderPath`) that dispatches `RESET_GRAPH` + `RESET_SESSION` whenever `folderPath` changes from one non-null value to a *different* non-null value (a genuine switch) — see "Dispatch order" below for why this design was chosen over literally wrapping `submit`.
- `src/components/folder/FolderPanel.tsx` (39 lines, edited — the only edit made to this file) — swapped the `useFolderConfig()` call for `useFolderSwitch()`, added a top-level `useIngestionStatus()` call, and rendered `<FolderStatusLine status={state.status} />` as a sibling of `<FolderPathInput />` inside the existing `CollapsiblePanel`.
- `tests/unit/FolderStatusLine.test.tsx` (60 lines, new) — 3/3 implemented (watching+queued, idle, extracting+filename).
- `tests/integration/useIngestionStatus.test.tsx` (183 lines, new) — 3/3 implemented, adapted from the WS-based stub to the polling design (see "Deviations" below).
- `tests/integration/useFolderSwitch.test.tsx` (141 lines, new) — 3/3 implemented (graph clears, chat clears, ingestion status resets).

No other files touched. Nothing in the brief's FROZEN list was edited — confirmed via `find src -newer <round-2-report-timestamp>` showing only my 4 files plus `worker-traversal`'s files (graph/chat/state), which I did not touch.

### Polling-derived status logic (honest limitations)

`useIngestionStatus` never sets `file` or `queued` on any dispatched status — both are always omitted. `/api/graph` returns no per-file extraction event and no queue-depth number, so there is no *real* value to put there. I considered attributing a newly-diffed node's `source_files[0]` to an "extracting: X" label, since `GraphNode.source_files` is real backend data — but rejected it: by the time a node appears in a poll response, that file's extraction has already *finished*, so labeling it "currently extracting" would misrepresent a completed event as in-progress. The brief's own language ("you cannot get a real filename... rather than fabricating") reads as ruling out exactly this move, and I agree with the reasoning, so I omit `file` entirely rather than build a plausible-looking lie.

State derivation per poll (closure-scoped per effect run, reset on every folder change):
- First poll for a folder: establishes the node-id-set baseline, dispatches `{state: "watching"}` (nothing observed yet).
- A poll whose node-id set grew since the previous poll: dispatches `{state: "extracting"}` and remembers that growth has been observed (`everGrew`).
- A poll with no growth: dispatches `{state: "idle"}` if growth was seen at some earlier point (settled after activity), or `{state: "watching"}` if growth has never been seen yet (still waiting, nothing has happened).

This is my judgment call on the brief's open question of "watching vs idle" — `watching` reads as "baseline/nothing has happened," `idle` reads as "caught up after activity," which matches `frontend_context.md` D3's "watching (folder active, no change) ... idle (stable)" without over-specifying a queue depth we don't have.

Polling starts on the first *interval tick* (2500ms after mount/folder-change), not immediately on mount — this makes the poll cadence deterministic and matches how the tests drive it via `vi.advanceTimersByTimeAsync(2500)`.

### Where useIngestionStatus is mounted and why it survives collapse

`useIngestionStatus()` is called directly inside `FolderPanel`'s function body, *above* the returned `<CollapsiblePanel>` — i.e., at the same level as the `useFolderSwitch()` call, not inside `CollapsiblePanel`'s `children`. `CollapsiblePanel`'s `Collapsible.Content` unmounts its `children` on collapse (no `forceMount` passed for the folder panel, matching Round 2's decision to leave `FolderPanel` on the original unmount-on-collapse behavior). Since `FolderPanel` itself never unmounts when its own content collapses (only its children do), the hook's `setInterval` — which lives in `FolderPanel`'s effect, not in `FolderStatusLine`'s — keeps running across a collapse/re-expand cycle. `FolderStatusLine` itself *does* unmount/remount on collapse (it's inside `children`), but that's harmless: it's purely props-driven, and the `status` value it re-reads on remount comes straight from `IngestionContext`, which is never torn down. Verified directly in `tests/integration/useIngestionStatus.test.tsx`'s third test: real `FolderPanel` render, real collapse/expand button clicks, status text asserted unchanged after re-expand.

### useFolderSwitch's dispatch order

`useFolderSwitch` does not literally intercept `submit`'s success/failure (impossible without changing `useFolderConfig`, which is frozen: `submit` catches all errors internally and never rethrows or returns a value, so a caller awaiting it can't distinguish success from failure by the returned promise alone). Instead it watches `ingestionState.folderPath` via a `useEffect` and fires `RESET_GRAPH` + `RESET_SESSION` exactly when that value changes from one non-null path to a *different* non-null path — which, given `useFolderConfig`'s implementation, only happens as a result of a successful `submit` dispatching `RESET_FOLDER`. This is deliberately *not* triggered by:
- The initial GET prefill (`null -> path`) — `previous === null` skips the reset branch, so mounting never fires a spurious reset.
- A failed submit — `useFolderConfig`'s `submit` only sets `error` on failure and never dispatches `RESET_FOLDER`, so `folderPath` doesn't change and the effect no-ops.

Because `RESET_FOLDER` and the graph/chat resets land in the same React effect-flush as `useGraphData`'s own folderPath-keyed refetch, the old graph/messages clear in the same tick the new folder starts loading — satisfying "clears before/as the new folder's data loads" without needing to reorder anything relative to a frozen hook I can't edit. `useFolderSwitch` returns `useFolderConfig()`'s result completely unchanged (same `{defaultFolder, error, submitting, submit}` shape), so `FolderPanel` only needed a one-line hook swap.

### Test Results

`cd /workspace/frontend && npx vitest run` (run twice to confirm stability against the sandbox's occasional worker-pool startup flakiness seen on the first attempt):
```
 Test Files  19 passed (19)
      Tests  56 passed (56)
```
- `tests/unit/FolderStatusLine.test.tsx` — 3/3 PASS
- `tests/integration/useIngestionStatus.test.tsx` — 3/3 PASS
- `tests/integration/useFolderSwitch.test.tsx` — 3/3 PASS
- All other test files (mine from Round 2, plus `worker-traversal`'s Round 3 files running in parallel) — PASS, untouched by me.

`npx tsc -b` — PASS, no output (clean).

`npm run build` — PASS:
```
dist/index.html                     0.80 kB │ gzip:   0.43 kB
dist/assets/index-CRaEHUR9.css     15.68 kB │ gzip:   4.01 kB
dist/assets/index-B09hNDrf.js   1,633.69 kB │ gzip: 449.68 kB
✓ built in 33.39s
```
(The chunk-size warning is pre-existing/unrelated to this brief's scope — driven by `worker-traversal`'s parallel changes to the 3D graph bundle, not anything I touched.)

### What the Orchestrator Should Know

- **Deviation (per brief's explicit instruction):** `tests/integration/useIngestionStatus.test.tsx`'s original stub imported `mockWebSocket` and described a "mocked event stream." I did not use `mockWebSocket` anywhere — it's adapted entirely to `mockFetch({graphRead: ...})` + `vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync()`, per the brief's explicit direction. Documented at the top of the test file itself as well.
- **Gotcha found (worth flagging for later rounds using fake timers + real interaction):** combining `vi.useFakeTimers()` with `@testing-library/user-event` clicks hung indefinitely in this sandbox, even with `userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })` (the documented fix). I switched the collapse/re-expand clicks in the third `useIngestionStatus` test to `fireEvent.click` (a synchronous DOM event, no pointer-sequencing/timer involvement) instead, which resolved it immediately. Also had to install fake timers *before* the component mounts (not mid-test) — an interval created while real timers are active is not affected by later switching to fake timers, since vitest's fake-timer install only intercepts calls to `setInterval`/`setTimeout` made after the switch.
- **Assumption:** the brief says "watching" for "no change" and separately says "idle" is a fallback state, without fully reconciling the two. I resolved this as watching = pre-first-growth baseline, idle = post-growth-settled — see "Polling-derived status logic" above for the reasoning. Flagging this explicitly as a judgment call per the brief's own request to document it.
- `useFolderSwitch`'s switch-detection is state-diff-based (watching `ingestionState.folderPath`), not a literal `submit` wrapper with a success callback — I considered this the only robust option given `useFolderConfig` (frozen) exposes no success/failure signal from `submit`'s return value, and a closure-captured pre-await snapshot of context state would be stale by the time `submit` resolves (React re-renders, doesn't mutate already-captured variables). Functionally it satisfies every acceptance criterion in the brief and the "thin wrapper" instruction (same returned shape, `useFolderConfig()` called once, no duplicate submit logic).
- Did not touch `state/types.ts`, any reducer, `CollapsiblePanel.tsx`, or any graph/chat file — those are `worker-traversal`'s Round 3 files, running in parallel in the same directory, and were already present with newer timestamps when I checked; I did not need to read or depend on any of that work for this brief.

### What the Next Worker Needs

- `useIngestionStatus()` is a void-returning hook (no return value) — any future worker wanting to read status should use `useIngestionState().state.status` directly, same as `FolderPanel` does; the hook is side-effect-only (kicks off polling as a side effect of being mounted).
- `useFolderSwitch()` has the exact same public shape as `useFolderConfig()`: `{ defaultFolder, error, submitting, submit }`. Anything that previously depended on `useFolderConfig`'s return shape continues to work unchanged if swapped to `useFolderSwitch`.
- `FolderStatusLine` renders `data-testid="folder-status-line"` — usable as a stable selector for any later E2E/integration test needing to assert on the folder panel's live status text.
- If a future round wants a real filename/queue-depth readout, that requires a backend change (a dedicated ingestion-status or per-file-event endpoint) — this is a real product gap, not something fixable purely on the frontend given the current `/api/graph` contract.

### Blockers

None. `useFolderConfig.ts` and the Round 2 report were both present and readable at the start; no dependency files were missing.
