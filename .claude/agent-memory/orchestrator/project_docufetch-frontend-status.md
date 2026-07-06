---
name: docufetch-frontend-status
description: Ship status and known open follow-ups for the docuFetch Graph frontend build as of 2026-07-06 — check docs/frontend/frontend_TASKS.md for current state before trusting this.
metadata:
  type: project
---

The docuFetch Graph frontend (`/workspace/frontend/`) shipped 2026-07-06 — all 14 issues in `docs/frontend/issues.md` built across 4 feature rounds + a Phase 7 integration gate, all independently reverified by the orchestrator (22 test files / 62 tests, tsc clean, production build clean).

**Why this matters if asked "where are we" later:** `docs/frontend/frontend_TASKS.md` has the authoritative `SHIPPED ✓` line and per-issue status table; `docs/frontend/frontend_context.md` has the full decision log (D1-D9) plus a "Post-ship follow-ups" section. Read those directly rather than relying on this memory for specifics, since they're the maintained source of truth and this note will go stale.

**E2E (Playwright) was explicitly NOT completed** — deferred to manual verification for two independent, verified reasons, neither a frontend code defect:
1. This sandbox's Chromium binary can't launch (missing system libs like `libglib-2.0.so.0`, no sudo available for `--with-deps`).
2. The backend's configured free-tier OpenRouter models return empty content for real ingestion/embedding prompts (confirmed via direct curl that keys/network/models work fine for trivial prompts — this is prompt-specific to these particular free models, not an infra issue), and a live chat query over `/ws/chat` hangs with no event ever emitted.

**How to apply:** if a future session is asked to "finish E2E" or "verify the app works end to end," the actual blocking work is (a) get a real browser environment (a CI image with system Chromium deps, or a machine with sudo) and (b) fix the backend's model configuration in `.env` (swap `OPENROUTER_LLM_MODEL`/`OPENROUTER_EMBED_MODEL` for models that actually return content for the extraction/embedding prompts) — not more frontend work. Don't re-attempt E2E in this exact sandbox without addressing at least the browser-launch blocker first, or it will fail the same way again.
