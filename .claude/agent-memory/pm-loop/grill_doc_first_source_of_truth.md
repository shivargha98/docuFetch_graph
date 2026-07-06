---
name: grill-doc-first-source-of-truth
description: docuFetch runs a grill-me session before every PM loop; grill_doc_roadmap.md is the primary decision log the PRD must synthesize from, with an explicit deferred/open-items list that must survive into features.md and issues.md
metadata:
  type: project
---

For docuFetch, a `grill-me` skill session happens before the PM loop and produces `docs/{scope}/grill_doc_roadmap.md` — a numbered decision log (e.g. 14 decisions for the backend's first pass) plus an explicit "Explicitly deferred" section listing things NOT yet decided (exact API shapes, message schemas, storage schemas, persistence-across-restart questions, exact threshold values, testing strategy).

**Why:** The user's instruction pattern for this project is: run grill-me first (separate session), then hand the resulting roadmap doc to the pm-loop agent with an instruction like "no further interview needed — all architecture decisions are already logged." The prd-generator skill's own instructions already say "do NOT interview the user, just synthesize" for this reason.

**How to apply:**
1. Always check for `docs/{scope}/grill_doc_roadmap.md` before starting the PRD step — it is the primary source when it exists, and prd-generator should synthesize directly from it rather than opening an interactive interview.
2. The deferred/open-items list in the grill doc must be threaded through every downstream artifact: carried into the PRD's "Out of Scope" section, then attached to specific features in features.md as "Open question" callouts, then attached to specific issues in issues.md as "Caveat" callouts. Never let a downstream skill silently invent a specific value (e.g. a similarity threshold, an endpoint path) to resolve one of these — flag it as open at every layer until an actual implementation pass tunes/decides it.
3. Backend example from the first pass (2026-07-05): entity-resolution merge thresholds, no-match similarity cutoff, Chroma collection schema, WS message schema, exact API endpoint shapes, and chat-persistence-across-restart were the six deferred items — they ended up pinned to specific issues in issues.md (Issue 3, 5, 12, 13, 14, 15/16 respectively) rather than resolved.

See also [[project-docs-conventions]].
