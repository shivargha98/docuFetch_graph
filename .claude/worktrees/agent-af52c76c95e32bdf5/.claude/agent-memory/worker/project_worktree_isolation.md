---
name: project-worktree-isolation
description: docuFetch repo worker agents run in a git worktree whose working tree lacks uncommitted docs/backend planning files and has no Python venv/pip preinstalled.
metadata:
  type: project
---

In this repo, brief-driven worker agents are sandboxed to a git worktree under
`/workspace/.claude/worktrees/agent-<id>/`. The Edit/Write tools refuse any
path under `/workspace/` that isn't inside that worktree ("This agent is
isolated in the worktree... Edit the worktree copy of this file instead").
Bash is NOT restricted this way — `cp`/`mkdir`/etc. against `/workspace/`
directly work fine from Bash.

**Why this matters:** `docs/backend/*` (prd.md, issues.md, orchestrator_plan.md,
backend_context.md, tests/, agent-briefs/) are untracked/uncommitted in the
main `/workspace` checkout as of the Round 1 foundation build (2026-07-05).
Git worktrees only inherit committed history, so a fresh worktree does NOT
contain these files even though `/workspace` (the shared checkout) does.

**How to apply:** At the start of a worker task, copy the brief + any
docs/backend files you need to read/edit into the worktree via `Bash cp`
first (Read can see `/workspace` directly, but Edit/Write cannot write
there). Do all Edit/Write work inside the worktree, then `Bash cp` the
deliverables (code, edited tests, updated context.md, the report) back out
to the matching `/workspace/docs/backend/...` paths so the orchestrator
finds them where the brief expects. Also: the repo's checked-in `.venv` is a
stale Windows `uv` venv (`Scripts/` layout, no pip) that doesn't run in this
Linux container — rebuild `.venv` at `/workspace/.venv` via
`python3 -m venv .venv` + bootstrapping `get-pip.py` (system Python lacks
`ensurepip`) before installing `requirements.txt`.
