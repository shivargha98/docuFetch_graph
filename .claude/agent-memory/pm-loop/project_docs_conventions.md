---
name: project-docs-conventions
description: docuFetch's docs/{scope}/ naming and structure conventions, confirmed against .claude/CLAUDE.md and actual file layout during the first backend PM loop pass
metadata:
  type: project
---

docuFetch's `.claude/CLAUDE.md` names the tracking/context file `context.md` (not `pm-loop-context.md`), sitting alongside `prd.md`, `features.md`, `issues.md`, `tasks.md`, `tests.md`, `tests/` in `docs/backend/` and `docs/frontend/`.

**Why:** CLAUDE.md project instructions override the generic pm-loop-agent default file name. Rule 7 of the pm-loop agent ("match existing docs structure") applies here.

**How to apply:** Always name the running-context file `context.md` in this project, not `pm-loop-context.md`, in both `docs/backend/` and `docs/frontend/`. Note there are ALSO separate `backend_context.md`/`frontend_context.md` and `backend_TASKS.md`/`frontend_TASKS.md` files owned by a *different* agent (the build orchestrator, not pm-loop) — those are for tracking implementation/build progress after PM docs exist, not for this PM loop's use. Don't confuse or overwrite them.

CLAUDE.md's file structure listing is the authoritative map of `docs/{scope}/` — check it fresh each loop rather than assuming, since it may be extended over time ("Keep on adding required information, gotchas for the project" is an explicit instruction in that file).

See also [[grill-doc-first-source-of-truth]], [[issues-creator-autonomous-mode]].
