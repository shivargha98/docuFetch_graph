# Worker Brief: Entity Resolution (Issues 4 + 5)

## Context
Rounds 1-2 are complete and verified in `/workspace/backend/`. You're building a new `backend/entity_resolution/` module. You're running in parallel this round with `worker-retrieval-answer` (Issues 9/10/11) — they build `backend/retrieval/`, `backend/answer_generation/`, and `backend/query_service.py`, and do not touch anything you touch. Neither of you touches `backend/ingestion/pipeline.py` this round (entity resolution is a cross-file/batch operation, not a per-file pipeline step — see architecture below).

**Critical process instruction (read this before anything else):** Round 2 suffered real data loss because parallel workers each copied the shared `docs/backend/tests/conftest.py` file wholesale into and back out of their isolated worktrees — whichever worker finished last silently discarded the others' fixture additions to that same file. To prevent a repeat: **implement and verify your needed conftest.py fixtures ONLY inside your own worktree's copy of the file, for your own local test-running purposes. Do NOT write/copy your conftest.py changes back to `/workspace/docs/backend/tests/conftest.py` at the end of your run** (whether via the Edit/Write tools or via Bash `cp`/heredoc/script). Instead, put the **exact, complete code** for every fixture you added or modified in your final report. A dedicated follow-up worker will merge fixture additions from both Round 3 workers into the shared file in one serial pass, then re-run everyone's tests. This is the only file you must not write back — every other file you create (`backend/entity_resolution/*.py`, `backend/clients/openrouter_client.py`, edits to your own test files) should be written normally to `/workspace` as usual.

Read first: `/workspace/docs/backend/issues.md` (Issues 4 and 5), `/workspace/docs/backend/features.md` ("Entity Resolution" module), `/workspace/docs/backend/backend_context.md` (full — decision #2 "Entity-resolution thresholds" is your resolved contract: merge >= 0.90, ambiguous band [0.75, 0.90), below 0.75 no merge), then the actual current code:
- `/workspace/backend/graph_store/store.py` — `GraphStore.merge_nodes(keep_id, merge_id)` already exists and does everything a merge needs (unions `source_files`, redirects edges, removes the merged-away node). **Call this, don't reimplement node merging.**
- `/workspace/backend/config.py` — `ENTITY_RESOLUTION_MERGE_THRESHOLD = 0.90` and `ENTITY_RESOLUTION_AMBIGUOUS_LOW = 0.75` already exist as the default values. Your functions must accept these as parameters (not read `config` directly inside the resolution logic) so tests can inject other values via the `entity_resolution_thresholds` fixture.
- `/workspace/backend/clients/openrouter_client.py` — has `extract_concepts` (implemented), `embed_text` (implemented by Round 2), `traversal_next_hop` (still a stub, not yours — Issue 10's worker owns it this round). You will ADD a new function here: `adjudicate_merge`.

## What to build

### 1. `backend/entity_resolution/__init__.py`, `backend/entity_resolution/resolver.py`
- `normalize_name(name: str) -> str` — lowercase, strip whitespace, collapse internal whitespace, and strip a trailing simple plural `s` (e.g. `"Neural Networks"` → `"neural network"`, `"Machine Learning"` → `"machine learning"`). Note: `graph_store.store._slugify` already lowercases/strips whitespace/punctuation when creating node ids, so two mentions differing ONLY by case/whitespace already collapse to the same node during ingestion — this function's job is specifically to catch what slugify does NOT catch: simple pluralization differences that produce genuinely different slugs (e.g. `concept_neural_network` vs `concept_neural_networks`) but should be treated as the same concept. Keep the pluralization rule simple (strip one trailing `s` if the word is >3 chars, to avoid mangling short words) — no NLP library, this is a heuristic per CLAUDE.md's simplicity-first rule.
- `find_string_tier_merges(graph_store: GraphStore) -> list[tuple[str, str]]` — compare every pair of nodes' `normalize_name(data["name"])`; return `(keep_id, merge_id)` pairs where normalized names match but node ids differ. No LLM call, no embeddings involved at all in this tier.
- `resolve_string_tier(graph_store: GraphStore) -> list[tuple[str, str]]` — call `find_string_tier_merges`, then `graph_store.merge_nodes(keep_id, merge_id)` for each pair found; return the list of merges applied (useful for tests/logging).
- `_cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float` — plain Python (sum of products / (sqrt(sum of squares) * sqrt(sum of squares))); no new numeric dependency needed for this.
- `resolve_embedding_tier(graph_store: GraphStore, merge_threshold: float = ENTITY_RESOLUTION_MERGE_THRESHOLD, ambiguous_low: float = ENTITY_RESOLUTION_AMBIGUOUS_LOW) -> list[tuple[str, str]]` — for node pairs remaining after the string tier (i.e., call this after `resolve_string_tier`, or operate on whatever nodes are currently in the graph — your call, but document it), embed each node's `f"{name}: {description}"` via `openrouter_client.embed_text`, compute cosine similarity:
  - `similarity >= merge_threshold` → merge via `graph_store.merge_nodes`, no LLM call.
  - `ambiguous_low <= similarity < merge_threshold` → call the new `openrouter_client.adjudicate_merge(concept_a, concept_b)` (see below); if it says "merge", call `graph_store.merge_nodes`; if "keep separate", do nothing.
  - `similarity < ambiguous_low` → leave separate, no LLM call.
  Return the list of merges actually applied.
- `resolve_all(graph_store: GraphStore, merge_threshold: float = ENTITY_RESOLUTION_MERGE_THRESHOLD, ambiguous_low: float = ENTITY_RESOLUTION_AMBIGUOUS_LOW) -> None` — convenience function running both tiers in order (string tier first, then embedding tier on what remains). This is what future callers (Round 4's watcher, or an integration test) will invoke after ingesting a batch of files — **not** a per-file pipeline.py hook, since resolution is inherently a cross-file/whole-graph operation. Do not modify `pipeline.py`.

### 2. New client function: `backend/clients/openrouter_client.py::adjudicate_merge(concept_a: dict, concept_b: dict) -> dict`
Add this function to the existing file (it currently has `extract_concepts`, `embed_text`, `traversal_next_hop` — add a fourth). `concept_a`/`concept_b` are dicts with `name`/`description`. Call the same `_client.chat.completions.create(model=OPENROUTER_LLM_MODEL, ...)` pattern `extract_concepts` uses, with a system prompt asking the model to decide whether the two concepts refer to the same real-world thing and should be merged, and respond with JSON `{"merge": true|false}`. Parse defensively (same try/except pattern as `extract_concepts` — on failure, default to `{"merge": False}` so a malformed adjudication response doesn't crash resolution or force an incorrect merge).

## Tests you own
Run `pytest docs/backend/tests/unit/test_entity_resolution.py docs/backend/tests/integration/test_entity_resolution_pipeline.py -v` (from within your worktree, using your own locally-edited conftest.py — see process instruction above).

`test_entity_resolution.py` has one signature mismatch you need to fix as part of filling in the stubs (same kind of mechanical edit as Round 2's fixture-param rename):
- `test_identical_normalized_names_merge_without_llm_call(mock_traversal_llm)` — the fixture name `mock_traversal_llm` doesn't semantically fit entity resolution (that name belongs to Issue 10's traversal-reasoning mock, owned by the other Round 3 worker this round). **Rename this test's parameter to a new fixture `mock_adjudication_llm`** (mocks `openrouter_client.adjudicate_merge`, same `.set_response()`/`.set_side_effect()` pattern as `mock_extraction_llm`/`mock_embedding_client`). For THIS specific test (pure string-tier merge, no embeddings/LLM involved at all), use it purely as a call-count spy: assert it was never invoked.
- `test_ambiguous_band_similarity_triggers_llm_adjudication(mock_embedding_client, entity_resolution_thresholds)` — this test's stub is missing an LLM-mock parameter even though its docstring requires "a mocked LLM adjudication response". **Add `mock_adjudication_llm` as a third parameter** and use `mock_adjudication_llm.set_response({"merge": True})` (or `False`, per the test's contract) to control the adjudication outcome.
- All other tests in this file keep their existing fixture signatures unchanged.

Implement `mock_adjudication_llm` in your OWN worktree's conftest.py copy (monkeypatch `backend.clients.openrouter_client.adjudicate_merge`) — same pattern as `mock_extraction_llm`/`mock_embedding_client` already in the shared file (read them for the exact pattern before writing yours). Remember: this fixture code goes in your REPORT, not back to the shared file.

For `test_entity_resolution_pipeline.py` (2 integration tests, both yours): these call `pipeline.ingest_file` twice (once per file, redirect `GRAPH_STORE_PATH` via `monkeypatch` same as existing integration tests in `test_ingestion_pipeline.py`) then call your `resolver.resolve_all(graph_store, ...)` (or the specific tier function relevant to that test) directly, and assert the graph ends with one merged node referencing both files.

## What NOT to build
- No new embedding model logic — reuse `openrouter_client.embed_text` (Round 2's implementation) unchanged.
- No async, no batching/performance optimization for large graphs — O(n²) pairwise comparison is fine for a personal-scale tool (CLAUDE.md: no speculative optimization).
- Don't touch `pipeline.py`, `backend/retrieval/`, `backend/answer_generation/`, `backend/query_service.py`, or `backend/vector_store/store.py` — not your files this round.
- Leave `test_threshold_boundary_behavior_is_parameterized_not_hardcoded` (`@pytest.mark.skip`-marked) alone — genuinely still an open question (exact threshold VALUES need empirical tuning), not something this round resolves.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-entity-resolution-report.md`:
- Files created/changed: `backend/entity_resolution/__init__.py`, `resolver.py`, `openrouter_client.py`'s new `adjudicate_merge` function, and the two test files (with the fixture-signature changes called out explicitly).
- **The complete, exact code for the `mock_adjudication_llm` fixture** you implemented and verified locally (this is what the follow-up merge worker will copy verbatim into the shared conftest.py) — include its full function body, not just a description.
- Exact pytest results for your 7 test-file tests (6 real + the skip) plus 2 integration tests, run from within your worktree.
- Confirm you did NOT write conftest.py back to `/workspace/docs/backend/tests/conftest.py`.
- Any deviation and why.

Run the tests (in your worktree, against your local conftest.py copy) before reporting done.
