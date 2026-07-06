---
name: parallel-worker-file-ownership
description: How to safely parallelize multiple workers editing the same checkout (e.g. a frontend app with shared node_modules/build tooling) without worktrees.
metadata:
  type: feedback
---

For a frontend (or similar single-checkout) build where node_modules/build tooling make per-worker git worktrees impractical, parallelize workers by strict, disjoint, explicitly-enumerated file ownership in each brief instead of isolation.

**How to apply:**
- One "foundation" round first, serial, single worker: scaffold the app, install ALL dependencies for the whole build (not just this round's), establish shared state/types/theme tokens, and freeze config files (package.json, vite/webpack config, tsconfig, global CSS, root App file).
- Every subsequent brief gets an explicit "Files you own" list and a "FROZEN (do not touch)" list naming every file another parallel worker in the same batch owns or that's frozen from a prior round.
- When two issues in the same round would both need to touch the same file (e.g. two features both extending a 3D graph view, or one shared test file with test cases spanning two issues), do NOT split that file's ownership across two parallel workers — assign the whole file to one of them, or serialize that round's work instead.
- Additive-only edits to shared/frozen-adjacent files (e.g. adding a reducer action) are fine if scoped to one worker per round with clear "additive only, do not touch existing cases" instructions.
- This produced zero file-clobbering conflicts across 4 rounds of a real build (docuFetch frontend, 2026-07-06) with 2-3 parallel workers per round.

Why this works where [[worker-verification-discipline]] alone wouldn't: worktree copy-out was the actual failure mode in a prior (backend) build — parallel workers overwrote each other's edits to shared files when merging worktrees back. Disjoint ownership in a single shared checkout sidesteps that class of bug entirely, at the cost of requiring the orchestrator to actually enumerate ownership precisely in every brief (vague briefs reintroduce the risk).
