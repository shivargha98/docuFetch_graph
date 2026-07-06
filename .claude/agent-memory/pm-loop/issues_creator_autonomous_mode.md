---
name: issues-creator-autonomous-mode
description: issues-creator skill's built-in step 3 asks to review the draft issue list interactively with the user before writing issues.md — when running the full pm-loop autonomously with no user turn available mid-skill, this step must be substituted with a self-check, and that substitution should be disclosed to the user
metadata:
  type: feedback
---

The `issues-creator` skill's process (step 3, "Review the breakdown with the user") expects to present a numbered list of proposed issues and pause for approval/iteration before writing `issues.md`.

**Why:** When the pm-loop orchestrator invokes this skill as one step in a fully autonomous end-to-end run (user asked for "PRD → features → issues" as one pass, expects a final report rather than an interactive back-and-forth per skill), there's no natural point to pause mid-skill for a human review turn — the calling agent (pm-loop) doesn't have a user message to relay the draft to and wait on.

**How to apply:** When running issues-creator as part of an autonomous pm-loop pass:
1. Draft the full issue list directly (skip the interactive pause).
2. Perform the self-check yourself: build a feature-to-issue coverage table/mapping and verify every feature in features.md maps to at least one issue before writing the file.
3. Explicitly disclose in `context.md` that the interactive review checkpoint was replaced by this self-check, so the user knows issues.md hasn't been human-approved yet and can request revisions directly.

This is not a contradiction of the skill — it's the documented pm-loop behavior of "ask before assuming" applied at the meta level (flagging the process deviation) rather than blocking the whole loop on a review turn that isn't available. Confirmed as the right call in the first backend pass (2026-07-05) since the user explicitly asked to "run the pipeline... stop after issues.md and report back," implying no mid-pipeline interaction was expected.

**Reconfirmed on the frontend pass (2026-07-05):** same instruction pattern ("PRD → features → issues... stop after issues.md and report back"), same substitution applied (self-check coverage table built directly into issues.md itself this time, not just context.md) and disclosed in both issues.md and context.md. This is now a consistent, repeatable project convention across both scopes — apply it by default whenever a pm-loop round is scoped to stop before/at issues.md without an interleaved user turn.

See also [[grill-doc-first-source-of-truth]], [[cross-scope-dependency-pinning]].
