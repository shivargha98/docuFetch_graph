---
name: worker-verification-discipline
description: Concrete practices for independently verifying worker output rather than trusting self-reports, including how to handle session interruptions and flaky test infra.
metadata:
  type: feedback
---

Never mark a tracker row done off a worker's own report alone — always independently re-run the actual verification commands (test suite, typecheck, build) after every round, even when the worker's report already includes passing output. Confirmed valuable in practice: a worker's own "all green" claim is a starting point to spot-check, not a substitute for re-running it yourself.

**Session-limit / mid-task interruption recovery:** if a worker (or the orchestrator itself) gets cut off mid-round, do NOT assume partial/corrupted work exists. Check file modification timestamps directly (`find <dir> -newer <known-good-marker-file>` or `-printf '%T@ %p\n' | sort`) before deciding whether to reconcile partial work or just relaunch fresh. In practice, workers killed by a session-limit cutoff while still in their reading/exploration phase had written zero files — always verify this empirically rather than assuming either "nothing happened" or "something broke."

**Workers pausing on self-spawned background jobs instead of reporting synchronously:** this happened even after being told explicitly "run verification synchronously, do not end your turn waiting on a background run." When a worker's final message describes waiting on a background process rather than reporting concrete pass/fail results, don't immediately treat this as failure — check whether it later completes properly (send it another message / wait for its next notification) before concluding you need to redo the work. In one build, two different workers in the same round did this and both self-corrected and produced full reports on resumption.

**Flaky test infrastructure:** under this kind of parallel-worker load, `vitest`'s forked-worker pool can intermittently fail a single, unrelated test file with `[vitest-pool-runner]: Timeout waiting for worker to respond` (a pool-startup timeout, not a real assertion failure) — seen recurring across multiple rounds of one build, never the same file twice, and never present when that file was re-run in isolation. Before treating a red full-suite run as a real regression: re-run just the implicated file alone; if it passes cleanly by itself, it's this kind of infra flakiness, not a real failure. Don't paper over an actually-failing assertion this way, though — only apply this after confirming the isolated re-run is clean.

See also [[parallel-worker-file-ownership]] for the complementary practice of preventing conflicts in the first place rather than just detecting them after the fact.
