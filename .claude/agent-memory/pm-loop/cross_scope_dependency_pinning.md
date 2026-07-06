---
name: cross-scope-dependency-pinning
description: When one scope's PM docs (frontend) depend on contracts left open in another scope's PM docs (backend), pin the dependency to the other scope's specific issue number at every layer (PRD/features/issues) rather than inventing a shape, and flag the pin as point-in-time
metadata:
  type: project
---

docuFetch runs backend and frontend PM loops separately, but they are not independent: the frontend (React chat UI + 3D concept graph) consumes contracts the backend PRD deliberately left open — e.g. the WebSocket traversal-event schema, the folder-configuration endpoint shape, and the graph-read endpoint shape. These were pinned in `docs/backend/issues.md` to specific issue numbers (WS schema → backend Issue 14, folder-config API → backend Issue 15, graph-read API → backend Issue 16) as of the 2026-07-05 backend pass.

**Why:** Two scopes evolving on separate PM-loop cadences means the frontend will always be building against integration points the backend hasn't finalized yet. Silently inventing a plausible shape (e.g. guessing the WS payload) in the frontend's PRD/features/issues would make those artifacts look more settled than they are and risk a rebuild once the backend's real implementation lands. This is the same principle as [[grill-doc-first-source-of-truth]] (never silently resolve a deferred item) applied across a scope boundary instead of within one.

**How to apply:**
1. Before starting a dependent scope's PRD, read the other scope's `context.md` and `issues.md` (not just its PRD) to find the exact issue numbers where cross-cutting contracts were deferred.
2. Thread the dependency through every layer of the dependent scope's docs: PRD "Implementation Decisions"/"Out of Scope" → features.md "Open question" callout → issues.md "Caveat (open question from PRD)" callout — referencing the other scope's specific issue number at each layer, not a vague "backend TBD."
3. Explicitly flag in the dependent scope's `context.md` that these are point-in-time pins: if the other scope's issue numbering changes on a future pass, the dependent scope's docs should be re-checked against the current state rather than assumed still accurate.
4. Confirmed pattern on the frontend pass (2026-07-05): 7 of 14 frontend issues carry a caveat pinned to backend Issues 14/15/16, threaded consistently from `docs/frontend/prd.md` through `features.md` through `issues.md`.
5. The pin extends one layer further into the test suite: when test-suite-generator-frontend runs, tests exercising an open cross-scope contract should assert only the behavior already fixed by the PRD/issues (e.g. "success clears error state," "each event highlights the next node in order") against a mocked payload commented as illustrative/provisional — not a full contract test. Confirmed on the frontend test-suite pass (2026-07-05): 11 of 66 generated tests (across `useWebSocket`, `useFolderConfig`, `useFolderSwitch`, `useIngestionStatus`, `useGraphData`, `useNodeFadeIn`, `useTraversalSync`) carry this caveat, and the shared `setup.ts` mock helpers (`mockFetch`, `mockWebSocket`) document which fixture shapes are provisional so there's one place to update once the real backend contract lands.

See also [[grill-doc-first-source-of-truth]], [[project-docs-conventions]].
