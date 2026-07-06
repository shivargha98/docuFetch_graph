---
name: resuming-deferred-pm-loop-steps
description: how to pick a PM loop back up when the user initially deferred a step (e.g. "skip tests for now") and later asks for it — update tasks.md's checklist state rather than treating it as a brand-new loop
metadata:
  type: feedback
---

When a user explicitly defers a pm-loop step (e.g. "stop after issues.md, don't run the test suite yet") and later comes back asking for that step, treat it as resuming the same loop, not starting a new one.

**Why:** `tasks.md` and `context.md` already exist with a "Final Status" section written for the truncated round. Blindly re-initializing or appending a second parallel set of sections creates confusing, duplicated history in files meant to be a single source of truth per CLAUDE.md's `docs/{scope}/` conventions.

**How to apply:**
1. Read the existing `tasks.md`/`context.md` first — don't re-derive scope/feature description from scratch.
2. Flip the deferred checklist line from its "NOT requested" wording back to an active step, add a new Progress Log entry (dated) explaining the step is now requested, then mark it complete when done.
3. Rewrite the "Final Status" / "Loop Completion Summary" sections in place (don't leave a stale "test suite not run" claim sitting next to a newer "test suite complete" section) — these summary sections describe the loop's current end-state, not a historical snapshot.
4. Still run the deferred skill's full process (read all inputs fresh) rather than assuming nothing changed since the earlier steps — in this project's case, test-suite-generator-backend still needs to cross-reference prd.md/features.md/issues.md itself even though the calling agent already has them in context.

Confirmed pattern from docuFetch backend loop (2026-07-05): PRD→features→issues completed and reported first; test suite step explicitly deferred by user; user returned in the same session asking for it; resumed by editing the existing tasks.md/context.md in place rather than creating a second round of files. See [[backend-test-suite-patterns]].
