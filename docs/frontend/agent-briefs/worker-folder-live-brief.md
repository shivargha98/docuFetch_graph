# Worker Brief: folder-live (Round 3 — Issues 5, 14)

You are one of TWO workers running in parallel directly in `/workspace/frontend` (no worktree) this round. The other (`worker-traversal`) has exclusive edit rights to `GraphView.tsx`, graph state files, and chat message/trace components. **You must NOT touch any graph or chat component/hook files, or any state files** — everything you need already exists from Rounds 1-2. Touch only the files listed under "Files you own".

Read `/workspace/docs/frontend/agent-reports/worker-folder-input-report.md` FIRST — it defines `useFolderConfig()`'s exact API and dispatch behavior you build directly on top of.

## Critical context — planning assumption corrected (read before building)

The grill doc/PRD assumed ingestion status arrives via **WebSocket-pushed events**. **The shipped backend has no such surface** — no ingestion WS channel, no `/ingest/status` endpoint. Only `GET /api/graph`, `GET/POST /api/folder-config`, and `WS /ws/chat` (chat traversal only) exist. See `/workspace/docs/frontend/frontend_context.md` decision D3 for the full reasoning. **Decision (already made, yours to implement):** `useIngestionStatus` polls `GET /api/graph` on an interval (~2-3s), diffs the returned node-id set against the previous poll, and derives a status:
- Node count grew since last poll → `{state: "extracting", file: <best-effort — see below>}`.
- No change and a folder is configured → `{state: "watching", queued: <optional, omit if you have no real number — see below>}`.
- (idle is a reasonable resting/fallback state — your judgment on exactly when to show `idle` vs `watching`, since the backend doesn't expose a queue depth or "is a scan running" flag. Document your judgment call.)

**Since `/api/graph` doesn't return per-file extraction info**, you cannot get a real filename or real queued count from this endpoint. Use a defensible fallback (e.g. omit `file`/`queued` when you don't have a real value — `FolderStatusLine`'s props make these optional) rather than fabricating fake filenames. Document this honestly in your report; it's a known product-fidelity gap from the backend's actual surface, not a bug for you to hide.

The test stub `docs/frontend/tests/integration/useIngestionStatus.test.tsx` imports `mockWebSocket` and describes a "mocked event stream" — that describes the ORIGINAL (WS) design, which no longer applies. **Adapt the test mechanically to the polling design while preserving the same asserted behavior**: use `mockFetch({graphRead: ...})` plus fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTime()`) to simulate successive polls returning growing node sets, instead of `emitMessage`. The three behaviors to still prove: (1) status updates without a manual refresh as polls return new data, (2) transitions reflect watching→extracting→idle-like sequences including some indication of the in-flight file/activity, (3) status is retained across a collapse/re-expand of the folder panel. Note this deviation clearly in your report — do not silently keep the WS-based mechanics only to have them do nothing.

## Issue 5 — Live ingestion status display

Build `useIngestionStatus` (`src/hooks/useIngestionStatus.ts`): starts polling once `ingestionState.folderPath` is set, dispatches `STATUS_UPDATE` (existing action, already used by `useFolderConfig`) with the derived status, stops/restarts polling on folder change.

Build `FolderStatusLine` (`src/components/folder/FolderStatusLine.tsx`) — **pure presentational component**, props-driven exactly per `docs/frontend/tests/unit/FolderStatusLine.test.tsx`: `status: IngestionStatus` (the existing discriminated union — `{state:"watching",queued?}` / `{state:"idle"}` / `{state:"extracting",file?}`). Render text reflecting each variant (watching+queued count if present, "Idle · up to date" for idle, filename for extracting if present). Add it as a sibling of `FolderPathInput` inside `FolderPanel.tsx` (the only edit you make to that file), reading `useIngestionState().state.status` directly — call `useIngestionStatus()` once from `FolderPanel` (or a wrapping component) to kick off polling.

Acceptance criteria:
- Status line updates without manual refresh as polls return new data.
- Reflects at minimum: watching/idle, and progress on an in-flight extraction (best-effort per the fallback note above).
- Collapsing/re-expanding the folder panel does not reset or lose current status (state lives in Context — this should be true for free as long as `useIngestionStatus` isn't mounted inside content that unmounts on collapse; verify `CollapsiblePanel`'s default behavior here — Round 2 added an opt-in `forceMount` prop for the chat panel but `FolderPanel` was NOT changed to use it, so confirm whether unmount-on-collapse would kill your polling interval, and if so, mount `useIngestionStatus()` at the `FolderPanel` component level — which persists as long as `FolderPanel` itself doesn't unmount — rather than inside the collapsible content).

## Issue 14 — Folder switching and session reset

Build `useFolderSwitch` (`src/hooks/useFolderSwitch.ts`): wraps `useFolderConfig`'s `submit` so that on a successful folder switch (not the very first prefill — this is specifically for switching AFTER a folder is already loaded), it also dispatches `RESET_GRAPH` (graph slice) and `RESET_SESSION` (chat slice) in addition to the `RESET_FOLDER`/`STATUS_UPDATE` dispatches `useFolderConfig` already fires. Order matters for the test spec: graph/chat should clear before/as the new folder's data loads (the existing `useGraphData` hook already refetches on `folderPath` change — your reset just needs to fire so stale nodes/messages don't linger during that refetch window).

Acceptance criteria:
- Submitting a new valid folder path clears the currently displayed graph (zero nodes/edges).
- Clears the chat transcript, starting a fresh session with no carried-over history.
- Ingestion status resets to reflect the new folder (not stale progress from the old one).

Implementation note: `useFolderSwitch` should be a thin wrapper — call `useFolderConfig()` internally, and on `submit` success additionally dispatch `RESET_GRAPH`/`RESET_SESSION` via `useGraphState()`/`useChatState()`. Wire it into `FolderPanel` in place of calling `useFolderConfig` directly (replace that one call site only — do not touch `useFolderConfig.ts` itself, `FolderPathInput.tsx`, or any of its own tests).

## Files you own (complete list — nothing else)

- `src/hooks/useIngestionStatus.ts`, `src/hooks/useFolderSwitch.ts` (new)
- `src/components/folder/FolderStatusLine.tsx` (new)
- `src/components/folder/FolderPanel.tsx` (edit: add `<FolderStatusLine>`, swap `useFolderConfig` call for `useFolderSwitch`)
- Tests copied from `/workspace/docs/frontend/tests/` into `/workspace/frontend/tests/` (same relative paths) and implemented: `unit/FolderStatusLine.test.tsx`, `integration/useIngestionStatus.test.tsx` (adapted to polling per above), `integration/useFolderSwitch.test.tsx`

FROZEN (do not touch): package.json, vite.config.ts, tsconfig*, src/index.css, src/App.tsx, `src/hooks/useFolderConfig.ts`, `src/components/folder/FolderPathInput.tsx`, ALL graph files (`src/components/graph/**`, `src/hooks/useGraphData.ts`, `src/lib/edgeStyles.ts`), ALL chat files (`src/components/chat/**`, `src/hooks/useWebSocket.ts`, `src/hooks/useChatSession.ts`), `src/components/ui/CollapsiblePanel.tsx`, `src/state/**` (no state changes needed — every action you need, `STATUS_UPDATE`/`RESET_FOLDER`/`RESET_GRAPH`/`RESET_SESSION`, already exists), `tests/setup.ts`, all prior-round test files. If a frozen file seems to need a change, don't — report it.

## Styling

Use existing theme tokens only (mono font for the status readout per the foundation's "system/telemetry readouts" token purpose, muted/ion accents as appropriate). No new design-skill invocation required for this brief — this is a behavioral/data issue, not a visual-identity one (per the original PRD annotation, Issue 5 was deliberately left unannotated for frontend-design).

## Verification (synchronous — never end your turn waiting on a background run)

1. `cd /workspace/frontend && npx vitest run` — everything passes. 2. `npx tsc -b` clean. 3. `npm run build` succeeds. Paste real numbers.

## Report — /workspace/docs/frontend/agent-reports/worker-folder-live-report.md

Include: files created/edited, the exact polling-derived status logic and its honest limitations (no real filename/queue depth from the backend), where `useIngestionStatus` is mounted and why it survives collapse, `useFolderSwitch`'s dispatch order, test/typecheck/build results, deviations, gotchas for Round 4/5.
