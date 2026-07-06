---
name: project-frontend-folder-input
description: Round 2 folder-input worker's hook/component contract and the mockFetch test-fixture limitation, for later frontend rounds (ingestion status, folder switch) that build on this panel.
metadata:
  type: project
---

Round 2 (worker-folder-input, 2026-07-06) built the real folder panel at
`/workspace/frontend/`:

- `src/hooks/useFolderConfig.ts` exports `useFolderConfig(): { defaultFolder,
  error, submitting, submit }`. `submit(path)` POSTs `/api/folder-config`; on
  2xx it clears error and dispatches `RESET_FOLDER` + `STATUS_UPDATE({state:
  "watching"})` to the ingestion slice ([[project-frontend-foundation]]'s
  `useIngestionState()`). The same two dispatches fire after the initial GET
  prefill succeeds. On non-2xx or a thrown fetch, only `error` is set — no
  ingestion dispatch, so `folderPath`/`status` are left untouched by a failed
  submit.
- `src/components/folder/FolderPathInput.tsx` is a pure presentational
  controlled input: `{ defaultFolder, error, onSubmit, submitting? }`. No
  network code in this component — `FolderPanel` wires it to the hook.
- **Test fixture gotcha:** `tests/setup.ts`'s `mockFetch({folderConfig})`
  routes by URL substring only (not by HTTP method), so it returns the *same*
  response to GET and POST alike. Any test needing "GET succeeds, then POST
  fails, then POST succeeds" (or any other GET/POST-divergent sequence) can't
  use `mockFetch` — stub `globalThis.fetch` locally with
  `vi.fn().mockResolvedValueOnce(...)` chains in the test file instead, per
  the brief's own guidance. Don't edit `tests/setup.ts` to add method-aware
  routing — that decision belongs to whichever worker owns that file.
- Unresolved/undecided (flagged in the report, not built): what happens on a
  *failed* initial GET prefill (network error or non-2xx) — currently
  swallowed silently, `defaultFolder` stays `""`. No acceptance criterion
  covered this; a later round may want to surface it.

See `docs/frontend/agent-reports/worker-folder-input-report.md` for the full
report (dispatch details, error-message extraction logic, test results).
