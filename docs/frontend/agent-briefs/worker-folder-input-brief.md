# Worker Brief: folder-input (Round 2 — Issue 4)

You are one of THREE workers running in parallel directly in `/workspace/frontend` (no worktree). The others own the chat panel/WS layer and the graph view. **Touch ONLY the files listed under "Files you own".**

Foundation (Round 1) is done and verified. Read `/workspace/docs/frontend/agent-reports/worker-foundation-report.md` FIRST — exact state types, provider hooks (`useIngestionState()` → `{state, dispatch}`), theme tokens, and test-fixture APIs live there.

## Backend contract (FINAL — from /workspace/backend/api/config_routes.py)

- `GET /api/folder-config` → 200 `{"path": "<current watched folder>"}` (backend always has a default from WATCH_FOLDER).
- `POST /api/folder-config` body `{"path": "<abs path>"}` → 200 `{"path": "...", "status": "watching"}` on success; **422 `{"detail": "Path does not exist" | "Path is not a directory"}`** on invalid input. (FastAPI validation errors can also return a `detail` array — treat any non-2xx as an error and surface a readable message.)
- Use relative URLs (`/api/folder-config`) — the Vite dev proxy forwards to the backend.

## Issue 4 — Folder path input, validation, and default prefill

Build the folder panel's real content: an absolute-path text input pre-filled from the backend, a submit action, and inline error display.

Acceptance criteria:
- On first load, the input is pre-filled with the backend's default watched folder (from GET /api/folder-config).
- Submitting a valid path clears any prior inline error AND updates ingestion state to reflect the new active folder.
- Submitting an invalid/unreadable path displays an inline error near the input without crashing or blanking the panel.

Implementation requirements:
- `useFolderConfig` hook in `src/hooks/useFolderConfig.ts`: loads the prefill, exposes submit, tracks `{error, submitting}`.
- **Cross-worker coordination point (mandatory):** after the initial GET prefill succeeds AND after every successful POST, dispatch `RESET_FOLDER` with the path and `STATUS_UPDATE` with `{state: "watching"}` to the ingestion slice. The WS worker's connection logic and Round 3's status/switch work all key off `folderPath` being populated this way.
- Keep the input a controlled component; keep `FolderPanel`'s `data-testid="folder-panel"` and its `CollapsiblePanel` wrapper (pass testId via the `testId` prop per the foundation pattern).
- Split the path input (+error) into its own component `src/components/folder/FolderPathInput.tsx` taking `defaultFolder` and `error` props per the unit-test stub — the panel wires it to the hook. Leave room in the panel for a status line component (Round 3 adds `FolderStatusLine` — don't build it).

## What NOT to build

- No folder SWITCHING teardown (clearing graph/chat on change) — that is Issue 14, Round 3. Your job ends at posting the path, dispatching the two ingestion actions, and showing errors.
- No ingestion status display/polling (Issue 5, Round 3).
- No WebSocket anything.
- No new dependencies, no new theme tokens (style with existing ones: glass-panel, mono font for the path, ion accent for focus, a restrained red/amber inline error is fine via Tailwind's stock palette).

## Files you own (complete list — nothing else)

- `src/hooks/useFolderConfig.ts` (new)
- `src/components/folder/**` (replace FolderPanel placeholder internals; add FolderPathInput.tsx)
- Tests copied from `/workspace/docs/frontend/tests/` into `/workspace/frontend/tests/` (same relative paths) and implemented: `unit/FolderPathInput.test.tsx`, `integration/useFolderConfig.test.tsx`

FROZEN (do not touch): package.json, vite.config.ts, tsconfig*, src/index.css, src/App.tsx, src/state/** (the actions you need — RESET_FOLDER, STATUS_UPDATE — already exist; the realtime-chat worker has exclusive edit rights to state files this round), src/components/chat/**, src/components/graph/**, src/components/ui/**, tests/setup.ts, tests/unit/{reducers,AppShell,ThemeProvider,CollapsiblePanel}.test.*. If a frozen file seems to need a change, don't make it — note it in your report.

## Testing notes

- `mockFetch({folderConfig: {status, body}})` from `tests/setup.ts` stubs fetch by URL substring. For tests needing different GET vs POST behavior, check what the fixture supports and, if insufficient, stub `fetch` locally within your own test file (do NOT edit setup.ts).
- Stub doc comments define the behavior; the existing 15 tests must stay green.

## Verification (synchronous — never end your turn waiting on a background run)

1. `cd /workspace/frontend && npx vitest run` — everything passes. 2. `npx tsc -b` clean. 3. `npm run build` succeeds. Paste real numbers.

## Report — /workspace/docs/frontend/agent-reports/worker-folder-input-report.md

Include: files created/edited, the hook's public API (verbatim TS signature — Round 3's folder-live worker extends this panel), exactly which dispatches fire on prefill/submit success/failure, how errors render, test/typecheck/build results, deviations, gotchas for Round 3 (Issues 5 and 14 build directly on your panel and hook).
