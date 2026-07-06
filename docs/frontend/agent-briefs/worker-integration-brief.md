# Worker Brief: integration (Phase 7 — final gate)

You are the final worker for the docuFetch Graph frontend build. All 14 issues in `docs/frontend/issues.md` are implemented across 4 rounds (foundation shell/state, WS/chat/folder-input/3D-graph, traversal-sync/trace-UI/folder-live-status, node-fade-in/HUD-overlay). Your job is NOT to build new features — it's to verify the whole thing holds together, run the full test suite + typecheck + production build as the gate, attempt the 4 Playwright E2E specs against the real backend (best-effort), and produce the report that determines whether the build ships.

Read `/workspace/docs/frontend/frontend_context.md` in full first — it has every interface decision, frozen-file boundary, and known gap from all 4 rounds (D1-D9). Read `/workspace/docs/frontend/frontend_TASKS.md` for the per-issue status log. Do NOT re-read every individual worker report unless you need to chase a specific detail — the context doc already distills them.

## Part 1 — Full verification gate (do this first, synchronously)

1. `cd /workspace/frontend && npx vitest run` — all 22 test files / 62 tests must pass. **Known sandbox behavior**: an isolated single test file occasionally fails with `[vitest-pool-runner]: Timeout waiting for worker to respond` under CPU load (seen intermittently across every round so far, on different files each time, never the same file twice). If you see this, re-run that ONE file alone (`npx vitest run tests/path/to/file.test.tsx`) — if it passes cleanly in isolation, it's the known flakiness, not a real failure; note this in your report. If a file fails for a real assertion reason (not a pool-startup timeout), that's a real bug — investigate and either fix it yourself (if trivial and clearly within a single file) or report it as a blocker with specifics (do not paper over a real failure as "flakiness").
2. `npx tsc -b` — must be clean.
3. `npm run build` — must succeed. The >500kB chunk-size warning from bundling `three`/`react-force-graph-3d` is expected and pre-existing across every round — not a failure, no code-splitting was ever requested.

## Part 2 — Cross-round integration audit

Do a light but real pass confirming the pieces actually wire together as designed, not just that each round's own tests pass in isolation:
- Launch the dev server (`npm run dev`, backgrounded) and confirm it serves without a console/runtime error (check via `curl localhost:<port>` for a 200, or check the process log for startup errors). You don't need a browser for this — just confirm Vite serves the built app without throwing.
- Skim `src/App.tsx` and confirm all three panels (`FolderPanel`, `GraphView`, `ChatPanel`) are actually mounted together, each pulling from the shared Context providers (not orphaned/unused components sitting in the tree).
- Confirm the full state flow described in `frontend_context.md` is coherent by reading (not necessarily re-testing) the chain: `useFolderConfig`/`useFolderSwitch` → `RESET_FOLDER`/`STATUS_UPDATE` → `useGraphData` refetch → `useNodeFadeIn` poll-diff → `useIngestionStatus` poll-diff → `useChatSession`/`useWebSocket` → `useTraversalSync` → `GraphView` highlight/camera-follow + `NodeDetailOverlay`. You're checking for an obviously broken link (e.g., a hook never actually mounted anywhere, a dispatch nobody listens for), not re-deriving each round's design from scratch.
- Note any real integration gap you find. Fix it yourself ONLY if it's small and unambiguous (e.g., a hook that's exported but never mounted from `App.tsx`/a panel — mount it). If it's a larger design question, report it as a finding rather than making a unilateral architectural call.

## Part 3 — E2E (Playwright) best-effort against the real backend

The backend is fully built and shipped (see `/workspace/backend/`). Attempt to run it for real:

1. Check for a Python venv at `/workspace/.venv` (it exists in this environment with `fastapi`/`uvicorn` already installed — verify with `/workspace/.venv/bin/python3 -c "import fastapi, uvicorn"`). Check `/workspace/.env` for `WATCH_FOLDER`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, etc. — API keys appear present, but `WATCH_FOLDER` is set to a **Windows-style path** (`D://docuFetch_data`) that will not exist in this Linux sandbox.
2. Create a small, real, Linux-path sample folder with 2-3 short `.md`/`.txt` files containing genuinely different concepts with some cross-references (so ingestion produces a non-trivial graph with a few typed edges) — e.g. under `/workspace/docs/frontend/tests/e2e/fixtures/` or `/tmp`. You will point the app at this folder via the UI's folder-path input (per Issue 4/14's real behavior), not by editing `.env` — that's the actual product flow.
3. Start the backend: `/workspace/.venv/bin/python3 -m uvicorn backend.main:app --port 8000` (or via `uvicorn` directly if the venv's bin is on PATH once activated) from `/workspace`, backgrounded, and confirm `curl localhost:8000/api/graph` returns `{"nodes":[],"edges":[]}` or similar before proceeding.
4. Start the frontend dev server (`npm run dev` in `/workspace/frontend`, backgrounded) — confirm the Vite proxy (`/api`, `/ws` → `localhost:8000`) is configured correctly (it was set up in Round 1; don't change it) and reaches the running backend.
5. Set up Playwright if not already configured (`@playwright/test` is installed from Round 1; you likely need a `playwright.config.ts` pointing at the dev server's URL, and `npx playwright install --with-deps chromium` for a browser binary — this may or may not succeed in this sandbox; if the browser install fails, that alone is sufficient grounds to mark E2E infeasible and fall back to manual documentation, don't fight sandbox/OS-level constraints here).
6. Copy the 4 stub specs from `/workspace/docs/frontend/tests/e2e/` into `/workspace/frontend/tests/e2e/` and implement them against the real running app + backend, driving the actual folder-path submission → ingestion polling → graph population → chat query → traversal highlight → answer flow (and the no-match / folder-switch / responsive-tablet variants) end to end.
7. Run `npx playwright test`. Report exact pass/fail results.

**If any part of this chain is infeasible** (browser install fails, backend fails to start, ingestion/LLM calls fail due to rate limits or network restrictions in this sandbox, etc.) — STOP that path, don't force it, and document in your report exactly what was tried, what failed, and why, per the user's original instruction to treat E2E as best-effort and fall back to "requires manual verification" documentation. This is an acceptable, expected outcome, not a build failure — the SHIPPED gate in Part 1 does not depend on E2E passing.

## Part 4 — SHIPPED decision

Update `/workspace/docs/frontend/frontend_TASKS.md`:
- If Part 1 (vitest + tsc + build) is fully green: add a line `**SHIPPED ✓** — <date>` near the top of the tracker, with a one-line summary of what that means (unit+integration suite green, typecheck clean, production build succeeds) and an honest note on E2E status (ran for real / partial / deferred to manual verification, whichever actually happened).
- If Part 1 is NOT fully green: do NOT mark shipped. Document exactly which check failed and why in the tracker, and in your report describe what a remediation brief for that specific issue would need to cover (you are not authorized to silently declare victory over a red gate).

## Report — /workspace/docs/frontend/agent-reports/worker-integration-report.md

Include: exact vitest/tsc/build output (Part 1), integration-audit findings and any fixes you made (Part 2, with file paths), the full E2E attempt narrative — what you tried, what worked, what didn't, and why (Part 3), and your SHIPPED/not-shipped determination with reasoning (Part 4). Be honest about partial results; this report is what the orchestrator uses to decide whether to loop back with a remediation brief or consider the build complete.

## What NOT to do

- Do not rewrite or "improve" any existing feature code outside of a genuine, small integration-gap fix per Part 2.
- Do not weaken/skip real test failures to force a green run.
- Do not spend excessive time forcing E2E to work in a sandbox that isn't built for it (no display server, possibly no real network egress) — a documented, honest "infeasible here, here's why, here's what manual verification should check" is a complete and acceptable answer for Part 3.
- Do not end your turn waiting on a background process — if you start one (dev server, backend, playwright), wait for and read its actual result yourself before finishing your turn.
