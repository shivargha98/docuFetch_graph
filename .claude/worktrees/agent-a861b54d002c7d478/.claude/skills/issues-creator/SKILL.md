---
name: issues-creator
description: Break a PRD and features.md into independently-grabbable issues saved to issues.md, using tracer-bullet vertical slices. Use when the user wants to turn features into work items, says things like "create issues", "break this into tasks", "what should I work on next", or "make issues from the features". Always reads prd.md and features.md before producing output.
user-invocable: true
allowed-tools: Read, Write, Glob
---

## Important Folder Structure

- If you are prompted to build for the backend, your docs folder path is [docs/backend](../../../docs/backend/)
- If you are prompted to build for the backend, your docs folder path is [docs/frontend](../../../docs/frontend/)

Break `features.md` (and `prd.md` for context) into independently-grabbable issues using vertical slices — tracer bullets that cut through all layers end-to-end. Output goes to `issues.md`.

## Inputs

The user may pass paths explicitly, or reference them in conversation. If not specified, search `docs/backend` or `docs/frontend` for:
- `features.md` — primary source (the features to slice into issues)
- `prd.md` — context (user stories, scope, implementation decisions)

## Process

### 1. Read both docs

Read `features.md` fully — this is your work list. Read `prd.md` for context: user stories, module boundaries, acceptance criteria intent, and anything marked out of scope.

### 2. Draft vertical slices

Break features into **tracer bullet** issues. Each issue is a thin vertical slice — it cuts through ALL relevant layers end-to-end, not a single layer in isolation.

**Vertical slice rules:**
- Each slice delivers a narrow but complete path through every layer it touches (e.g. ingestion → storage → retrieval → response)
- A completed slice is independently demoable or verifiable
- Slices should be small enough to finish in one focused session
- Any prefactoring that unblocks multiple slices should be its own issue and listed as a blocker

**Not this (horizontal):** "Add all ChromaDB schema migrations"  
**This (vertical):** "Ingest a single PDF and retrieve a matching chunk via the CLI"

### 3. Review the breakdown with the user

Present proposed issues as a numbered list. For each, show:
- **Title** — short, descriptive
- **Blocked by** — which other issues (by number) must complete first
- **Features covered** — which features from features.md this addresses

Ask:
- Does the granularity feel right?
- Are the dependencies correct?
- Should any issues be merged or split?

Iterate until the user approves.

### 4. Write issues.md

Save all approved issues to the same directory as `features.md` (default: `docs/backend/issues.md` or `docs/frontend/issues.md`).

Use this template for every issue:

```
## Issue [N]: [Title]

**What to build:**
[Concise description of this vertical slice — end-to-end behavior, not layer-by-layer steps. No file paths or code snippets unless a snippet encodes a decision more precisely than prose can.]

**Acceptance criteria:**
- [ ] Criterion (observable, verifiable by running the code)
- [ ] Criterion
- [ ] Criterion

**Blocked by:** Issue [N], Issue [N] / None — can start immediately
```

Issues are written in dependency order — blockers first — so the file reads as a natural build sequence.

## Output format

```markdown
# Issues

_Generated from: [path to features.md]_

---

## Issue 1: [Title]

**What to build:**
...

**Acceptance criteria:**
- [ ] ...

**Blocked by:** None — can start immediately

---

## Issue 2: [Title]
...
```
