---
name: prd-to-features
description: Convert a PRD into a concrete, buildable features.md — grouped by module with acceptance criteria. Use this whenever the user wants to break down a product requirements document into implementable features, or says things like "break the PRD into features", "what do we need to build", "extract features from the spec", "create features.md", or "give me a feature list from the PRD". Triggers right after /prd-generator runs. Always reads both prd.md (primary) and grill_doc_roadmap.md (silent fallback) before producing output.
user-invocable: true
allowed-tools: Read, Write, Glob
---

Synthesize a PRD (and a grill doc as silent fallback) into a structured `features.md`, grouped by module, with acceptance criteria per feature.

The PRD is the primary source. The plan doc fills gaps — use it when the PRD is ambiguous or leaves something implicit, but never let it override an explicit PRD decision.

## Important Folder Structure

- If you are prompted to build for the backend, your docs folder path is [docs/backend](../../../docs/backend/)
- If you are prompted to build for the backend, your docs folder path is [docs/frontend](../../../docs/frontend/)

## Inputs

The user may pass paths explicitly (e.g. `/prd-to-features backend/prd.md backend/grill_doc_roadmap.md`), or reference them in conversation. If paths aren't given, search `docs/backend` or `docs/frontend` for:
- `prd.md` — primary source
- `grill_doc_roadmap.md` — fallback and context

## Process

### 1. Read the PRD fully

Identify and note:
- The problem statement and solution summary
- Every user story
- Implementation decisions — especially which modules are being built and their boundaries
- Anything marked out of scope

### 2. Read the plan silently

Read `grill_doc_roadmap.md`. Use it only to fill what the PRD left vague: module boundaries, technical intent behind a user story, implicit sequencing, or terminology. Never let it override an explicit PRD decision.

### 3. Identify module groups

Extract module groups from the PRD's implementation decisions. Use the names the PRD uses. Don't invent groupings that aren't grounded in the source material.

If the PRD doesn't name modules explicitly, infer them from the user stories and implementation decisions, then check grill_doc_roadmap.md to confirm your groupings make sense.

### 4. Extract features per module

For each module, extract concrete, buildable features. A good feature is:
- **Scoped to one module** — if it naturally spans two, split it at the boundary
- **Independently startable** — a developer can begin it without finishing another feature first (unless an explicit dependency exists)
- **Verifiable** — the acceptance criteria can be confirmed by running the code

Every user story in the PRD should map to at least one feature. If a story has no home, create the feature and assign it to the most fitting module.

### 5. Write each feature

Use this exact format for every feature:

```
### Feature: [Name]

[1–2 sentences: what this feature does and why it matters]

**Acceptance criteria:**
- [ ] [Observable behavior — what a developer can verify by running the code]
- [ ] ...
- [ ] ...
```

Acceptance criteria guidelines:
- Write them as observable outcomes, not implementation steps ("returns X when given Y", not "call function Z")
- 3–5 criteria per feature — if you need more, the feature is too big; split it
- Don't restate the description as a criterion

### 6. Save

Save to the same directory as the PRD (`docs/backend/features.md` or `docs/frontend/features.md`), unless the user says otherwise.

After saving, tell the user: how many features were created, which modules they cover, and flag any user stories that had no clear feature match (if any). Save this information in `context.md` file either in the backend or the frontend folder depending on which part the feature is being created for.

## Output format

```markdown
# Features

_Generated from: [path to prd.md]_

## [Module Name]

### Feature: [Feature Name]

[description]

**Acceptance criteria:**
- [ ] ...
- [ ] ...

### Feature: [Feature Name]
...

## [Next Module]
...
```
