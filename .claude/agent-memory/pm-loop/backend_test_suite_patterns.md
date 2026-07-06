---
name: backend-test-suite-patterns
description: docuFetch backend test-suite-generator conventions confirmed during the first full backend loop — stub structure, module-to-file mapping, and how open/deferred design questions get encoded as tests rather than skipped
metadata:
  type: project
---

For docuFetch's backend (blank-slate repo, no implementation yet), `test-suite-generator-backend` produces stub-only pytest files (`raise NotImplementedError` bodies) rather than real tests — there's nothing to implement against yet.

**Why:** matches the project's actual state (confirmed via `ls backend/` showing no directory) at the time of the first PM loop pass (2026-07-05). CLAUDE.md's file structure lists `docs/backend/tests.md` (the plan) and `docs/backend/tests/` (the stub suite) as siblings of `prd.md`/`features.md`/`issues.md` — NOT `backend/tests/` as the generic skill's own instructions say. Project convention (docs/backend/tests/) wins per the "match existing docs structure" rule.

**How to apply (structure that worked well and should be repeated):**
- `docs/backend/tests/conftest.py` — shared fixture stubs only (signatures + docstrings, no bodies).
- `docs/backend/tests/unit/` — one file per module named in features.md's module list (e.g. `test_entity_resolution.py`, `test_graph_store.py`). Closely-related features within one module (e.g. Retrieval's "vector-seeded lookup" + "bounded traversal") can share one file.
- `docs/backend/tests/integration/` — one file per multi-module end-to-end flow (e.g. `test_ingestion_pipeline.py`, `test_rag_query_pipeline.py`), not one per feature.
- `docs/backend/tests/api/` — one file per exposed transport surface (REST endpoints + the WS endpoint each get their own file).
- Every test docstring includes a `Source:` line pointing back to the specific Feature/Issue + criterion number — this is what let the self-check ("does every feature/issue have a test") be verified mechanically via grep/walkthrough rather than by feel.

**How open/deferred design questions get handled in tests (don't silently invent values):** when features.md/issues.md flags something as an open question (exact thresholds, undecided schema, unfixed endpoint shape), the corresponding test asserts the *behavioral contract* using an injectable fixture value instead of a hardcoded guess, and is annotated with a `# OPEN QUESTION (Issue N): ...` comment in the docstring. If the open item can't be tested at all without a decided value/shape (e.g. full WS schema, full API payload shape), write one dedicated `@pytest.mark.skip(reason="OPEN QUESTION...")` test as a placeholder rather than omitting coverage entirely. See [[grill-doc-first-source-of-truth]] for why this discipline matters project-wide, not just at the PRD layer.

Confirmed working end-to-end on the first backend loop: 20 features / 17 issues → 89 test stubs across 19 files, all `py_compile`-clean, zero coverage gaps outside the six intentionally-deferred items.
