### Status
COMPLETE

### What I Built

- `src/hooks/useFolderConfig.ts` (106 lines, new) — loads the backend's default watched folder via `GET /api/folder-config` on mount and exposes a `submit` function that `POST`s a new path.
- `src/components/folder/FolderPathInput.tsx` (68 lines, new) — controlled, presentational absolute-path input + inline error + submit button.
- `src/components/folder/FolderPanel.tsx` (30 lines, edited — replaced the Round 1 placeholder) — wires `useFolderConfig` to `FolderPathInput` inside the existing `CollapsiblePanel` (kept `data-testid="folder-panel"`, kept the `testId` prop pattern, no new wrapper div).
- `tests/unit/FolderPathInput.test.tsx` (52 lines, new) — copied the stub from `docs/frontend/tests/unit/FolderPathInput.test.tsx` and implemented both cases (prefill on render, error rendered near the input without unmounting the field).
- `tests/integration/useFolderConfig.test.tsx` (109 lines, new) — copied the stub from `docs/frontend/tests/integration/useFolderConfig.test.tsx` and implemented both cases (submit clears a prior error + updates ingestion state; submit failure surfaces an inline error without crashing).

No other files touched. Nothing in the FROZEN list was edited.

### Hook public API (verbatim, `src/hooks/useFolderConfig.ts`)

```ts
export interface UseFolderConfigResult {
  defaultFolder: string;
  error: string | null;
  submitting: boolean;
  submit: (path: string) => Promise<void>;
}

export function useFolderConfig(): UseFolderConfigResult
```

`FolderPathInput` props: `{ defaultFolder: string; error: string | null; onSubmit: (path: string) => void; submitting?: boolean }`.

### Dispatches fired

- **On mount, after `GET /api/folder-config` resolves 2xx:** `dispatch({ type: "RESET_FOLDER", folderPath: body.path })` then `dispatch({ type: "STATUS_UPDATE", status: { state: "watching" } })`. (No dispatch, no error state, on GET failure — no acceptance criterion covers it; the input is simply left blank. See "What the Orchestrator Should Know".)
- **On `submit(path)` success (`POST` 2xx):** `setError(null)`, `setDefaultFolder(body.path)`, then the same two dispatches (`RESET_FOLDER` with `body.path`, `STATUS_UPDATE` with `{ state: "watching" }`).
- **On `submit(path)` failure (non-2xx, or a thrown/network error):** `setError(<readable message>)` only — no ingestion dispatch fires, so `folderPath`/`status` are left at whatever they were before the failed submit.

### Error rendering

`extractErrorMessage(body)` in the hook reads `body.detail`: if it's a string, uses it verbatim (matches the backend's `{"detail": "Path does not exist"}` / `{"detail": "Path is not a directory"}` shape); if it's an array (FastAPI validation-error shape), uses the first entry's `.msg`; otherwise falls back to a generic `"Failed to update the watched folder."`. A thrown/network-level fetch error is caught and mapped to `"Could not reach the server."`. `FolderPathInput` renders this string in a `<p role="alert" className="text-sm text-red-400">` beneath the input row — the input itself and the rest of the panel stay mounted.

### Test Results

`cd /workspace/frontend && npx vitest run`:
```
 Test Files  6 passed (6)
      Tests  19 passed (19)
```
- `tests/unit/FolderPathInput.test.tsx` — 2/2 PASS
- `tests/integration/useFolderConfig.test.tsx` — 2/2 PASS
- Pre-existing 15 tests (`reducers`, `AppShell`, `ThemeProvider`, `CollapsiblePanel`) — 15/15 still PASS (untouched).

`npx tsc -b` — PASS, no output (clean).

`npm run build` — PASS:
```
dist/index.html                   0.80 kB │ gzip:  0.43 kB
dist/assets/index-C6qSjQjz.css   12.17 kB │ gzip:  3.28 kB
dist/assets/index-C4boT-CZ.js   234.42 kB │ gzip: 74.49 kB
✓ built in 12.37s
```

### What the Orchestrator Should Know

- **`mockFetch` from `tests/setup.ts` couldn't express this issue's test scenarios** because it routes every `/api/folder-config` request (GET and POST alike) to one static stubbed response, and both my tests need a sequence (GET succeeds on mount, then a POST fails, then a POST succeeds). Per the brief's explicit allowance, I stubbed `globalThis.fetch` locally in `tests/integration/useFolderConfig.test.tsx` with `vi.fn().mockResolvedValueOnce(...)` chains instead of touching `setup.ts`.
- **Assumption (undocumented in the brief):** a failed initial `GET /api/folder-config` (network error or non-2xx) is swallowed silently — `defaultFolder` just stays `""` and no ingestion dispatch fires. The brief's acceptance criteria only describe the prefill *success* path and the submit error path; I did not invent an error UI for prefill failure to avoid speculative scope. Flag if Round 3 or later wants this surfaced.
- **Assumption:** `submit`'s catch-all for a thrown/rejected `fetch` (as opposed to a non-2xx response) maps to a generic `"Could not reach the server."` message — this case isn't in the brief's acceptance criteria either (which frame errors as coming from a 422 response), but "never crashing" is explicit, so a network-level throw still needs to resolve to an inline error rather than an unhandled rejection.
- Did not build `FolderStatusLine` (Round 3, Issue 5) or any folder-switch teardown (Round 3, Issue 14) — out of scope per the brief. `FolderPanel`'s children are currently just `<FolderPathInput .../>` directly inside `CollapsiblePanel`; there's no extra wrapper div blocking a sibling status-line component from being added.
- No frozen files were touched; no new dependencies added; no new theme tokens added (styled with existing `bg-glass`, `border-glass-border`, `text-ion`, `font-mono`, `text-text-primary`, plus stock Tailwind `text-red-400` for the error, as suggested by the brief).

### What the Next Worker Needs

- **Round 3 (Issue 5 — ingestion status/polling; Issue 14 — folder switch teardown):** build directly on `src/components/folder/FolderPanel.tsx` and `src/hooks/useFolderConfig.ts`.
  - `useFolderConfig()` returns `{ defaultFolder, error, submitting, submit }` — `defaultFolder` doubles as "the currently active folder path" (kept in sync with `ingestion.state.folderPath` by design), so Issue 14's switch-teardown logic can watch either that or `useIngestionState().state.folderPath` to detect a change and trigger graph/chat resets.
  - `FolderPathInput` takes `{ defaultFolder, error, onSubmit, submitting? }` — add `FolderStatusLine` as a sibling of `<FolderPathInput />` inside `FolderPanel`, reading `useIngestionState().state.status` (`IngestionStatus` — `idle` / `watching` / `extracting`) directly; no new plumbing needed in the hook for that.
  - Both `RESET_FOLDER` and `STATUS_UPDATE({ state: "watching" })` fire together on every prefill/submit success, per the brief's cross-worker coordination requirement — the WS worker's connect logic can key off `ingestion.state.folderPath` becoming non-null.

### Blockers

None. No dependency files were required for this issue (backend contract was given directly in the brief; foundation report and all frozen files existed and were readable).
