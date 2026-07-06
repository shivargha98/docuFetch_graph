# Worker Brief: Round 3 conftest.py fixture merge

## Context
Two Round 3 workers (`worker-entity-resolution` for Issues 4/5, `worker-retrieval-answer` for Issues 9/10/11) each implemented and locally verified fixtures for `docs/backend/tests/conftest.py`, but per this round's process (established after Round 2's shared-file clobbering incident), neither wrote back to the shared file — they reported exact, tested, verbatim fixture code instead. Your job is purely mechanical: apply the four pieces of already-written, already-verified code below to the real `/workspace/docs/backend/tests/conftest.py`, then re-run the full test suite to confirm everything integrates.

This is NOT a design task — every line of code below has already been tested and reported as working by the worker who wrote it. Do not modify the logic; only adapt import placement/ordering if needed for the file to be valid Python.

## Exact changes to `/workspace/docs/backend/tests/conftest.py`

### 1. Replace the `mock_traversal_llm` stub (currently `raise NotImplementedError` around line 238) with:
```python
@pytest.fixture
def mock_traversal_llm(monkeypatch):
    """
    Provide a mocked OpenRouter traversal-reasoning client (`OPENROUTER_LLM_MODEL`,
    used in its traversal-reasoning role) whose "next edge to follow" decision
    can be configured per-test.

    Monkeypatches `backend.clients.openrouter_client.traversal_next_hop` with a
    fake exposing `.set_response(payload)`/`.set_side_effect(exc)` (same
    pattern as `mock_extraction_llm`), plus `.set_side_effect_sequence([...])`
    for tests that need a different decision on each successive call (e.g.
    hop 1 continues, hop 2 stops - the sequence's last entry repeats if there
    are more calls than entries). `.set_response()` also accepts a callable
    `(current_node, neighbors, query) -> dict` instead of a fixed dict, for
    tests whose decision depends on which neighbors are actually offered
    (e.g. "always continue to whichever single neighbor is offered"). Every
    call is recorded in `.calls` as a `(current_node, neighbors, query)`
    tuple so tests can assert the LLM was actually invoked with the current
    node's neighbor edges.
    """
    from backend.clients import openrouter_client

    state = {"response": {"next_node_id": None, "relation": None}, "side_effect": None, "sequence": None}

    def fake_traversal_next_hop(current_node, neighbors, query):
        """Stand-in for openrouter_client.traversal_next_hop; records the call and returns/raises whatever the test configured."""
        fake_traversal_next_hop.calls.append((current_node, neighbors, query))
        if state["side_effect"] is not None:
            raise state["side_effect"]
        if state["sequence"] is not None:
            index = min(len(fake_traversal_next_hop.calls) - 1, len(state["sequence"]) - 1)
            response = state["sequence"][index]
        else:
            response = state["response"]
        if callable(response):
            return response(current_node, neighbors, query)
        return response

    def set_response(response):
        """Configure the dict (or callable) fake_traversal_next_hop should return on every subsequent call."""
        state["response"] = response
        state["side_effect"] = None
        state["sequence"] = None

    def set_side_effect(exc):
        """Configure an exception for fake_traversal_next_hop to raise on every subsequent call."""
        state["side_effect"] = exc
        state["sequence"] = None

    def set_side_effect_sequence(responses):
        """Configure a list of responses returned one-per-call in order; the last entry repeats once the sequence is exhausted."""
        state["sequence"] = responses
        state["side_effect"] = None

    monkeypatch.setattr(openrouter_client, "traversal_next_hop", fake_traversal_next_hop)

    fake_traversal_next_hop.calls = []
    fake_traversal_next_hop.set_response = set_response
    fake_traversal_next_hop.set_side_effect = set_side_effect
    fake_traversal_next_hop.set_side_effect_sequence = set_side_effect_sequence
    return fake_traversal_next_hop
```

### 2. Replace the `mock_haiku_client` stub (currently `raise NotImplementedError` around line 248) with:
```python
@pytest.fixture
def mock_haiku_client(monkeypatch):
    """
    Provide a mocked Anthropic client (`ANTHROPIC_MODEL=claude-haiku-4-5`) whose
    final-answer response (or relevance double-check verdict) can be configured
    per-test.

    Monkeypatches `backend.clients.anthropic_client.generate_answer` with a
    fake exposing `.set_response(text)`/`.set_side_effect(exc)` (same pattern
    as `mock_extraction_llm`/`mock_embedding_client`). Every call is recorded
    in `.calls` as a `(context, query, history)` tuple so tests can assert
    what was actually passed to the answer call. Issue 12's `judge_relevance`
    double-check is a separate stub and is NOT mocked by this fixture.
    """
    from backend.clients import anthropic_client

    state = {"response": "Line one.\nLine two.\nLine three.\nLine four.", "side_effect": None}

    def fake_generate_answer(context, query, history):
        """Stand-in for anthropic_client.generate_answer; records the call and returns/raises whatever the test configured."""
        fake_generate_answer.calls.append((context, query, history))
        if state["side_effect"] is not None:
            raise state["side_effect"]
        return state["response"]

    def set_response(text):
        """Configure the answer text fake_generate_answer should return on its next call(s)."""
        state["response"] = text
        state["side_effect"] = None

    def set_side_effect(exc):
        """Configure an exception for fake_generate_answer to raise on its next call."""
        state["side_effect"] = exc

    monkeypatch.setattr(anthropic_client, "generate_answer", fake_generate_answer)

    fake_generate_answer.calls = []
    fake_generate_answer.set_response = set_response
    fake_generate_answer.set_side_effect = set_side_effect
    return fake_generate_answer
```

### 3. Replace the `entity_resolution_thresholds` stub (currently `raise NotImplementedError` around line 322) with:
```python
@pytest.fixture
def entity_resolution_thresholds():
    """
    Provide an injectable entity-resolution threshold configuration dict
    (`merge_threshold`, `ambiguous_low`) so tests can exercise boundary
    behavior without hardcoding specific values in test bodies. Matches
    `backend.config.ENTITY_RESOLUTION_MERGE_THRESHOLD` /
    `ENTITY_RESOLUTION_AMBIGUOUS_LOW`'s default values (0.90 / 0.75), per
    backend_context.md decision #2 ("Entity-resolution thresholds").

    OPEN QUESTION (Issue 5): exact threshold values are not yet empirically
    tuned against a real corpus; this fixture's defaults are placeholders for
    boundary-behavior testing only.
    """
    return {"merge_threshold": 0.90, "ambiguous_low": 0.75}
```

### 4. Add a NEW fixture `mock_adjudication_llm` (does not exist yet — insert it near `mock_embedding_client`/`mock_traversal_llm`, wherever reads cleanly):
```python
@pytest.fixture
def mock_adjudication_llm(monkeypatch):
    """
    Provide a mocked OpenRouter merge-adjudication client
    (`openrouter_client.adjudicate_merge`, used by entity resolution's
    ambiguous embedding-similarity band, Issue 5) whose merge/keep-separate
    decision can be configured per-test.

    Monkeypatches `backend.clients.openrouter_client.adjudicate_merge` (same
    pattern as `mock_extraction_llm`/`mock_embedding_client`): configure per
    test via `mock_adjudication_llm.set_response({"merge": True|False})` or
    `mock_adjudication_llm.set_side_effect(exc)`. Every call is recorded (as
    a (concept_a, concept_b) tuple) in `mock_adjudication_llm.calls`, so
    tests that expect adjudication to never fire (e.g. a pure string-tier or
    above-merge-threshold merge) can assert `mock_adjudication_llm.calls == []`
    as a call-count spy instead of configuring a response at all.
    """
    from backend.clients import openrouter_client

    state = {"response": {"merge": False}, "side_effect": None}
    calls = []

    def fake_adjudicate_merge(concept_a: dict, concept_b: dict) -> dict:
        """Stand-in for openrouter_client.adjudicate_merge that returns/raises whatever the test configured, recording each call's arguments."""
        calls.append((concept_a, concept_b))
        if state["side_effect"] is not None:
            raise state["side_effect"]
        return state["response"]

    def set_response(response):
        """Configure the dict fake_adjudicate_merge should return on its next call."""
        state["response"] = response
        state["side_effect"] = None

    def set_side_effect(exc):
        """Configure an exception for fake_adjudicate_merge to raise on its next call."""
        state["side_effect"] = exc

    monkeypatch.setattr(openrouter_client, "adjudicate_merge", fake_adjudicate_merge)

    fake_adjudicate_merge.set_response = set_response
    fake_adjudicate_merge.set_side_effect = set_side_effect
    fake_adjudicate_merge.calls = calls
    return fake_adjudicate_merge
```

## Do NOT touch
- Any other fixture in `conftest.py` (`tmp_watch_folder`, `sample_markdown_file`, `sample_txt_file`, `sample_pdf_file`, `sample_pdf_file_no_headings`, `mock_extraction_llm`, `mock_embedding_client`, `chroma_test_client`, `empty_graph`, `sample_graph`, `no_match_cutoff`, `fastapi_test_client`, `ws_test_client`) — all correct and verified, leave exactly as-is.
- `backend/entity_resolution/`, `backend/retrieval/`, `backend/answer_generation/`, `backend/query_service.py`, `backend/clients/openrouter_client.py`, `backend/clients/anthropic_client.py` — all production code is already correct and finalized (verified by the orchestrator independently). Do not edit any of these.
- `docs/backend/tests/unit/test_entity_resolution.py`, `test_retrieval.py`, `test_answer_generation.py`, `docs/backend/tests/integration/test_entity_resolution_pipeline.py`, `test_rag_query_pipeline.py` — test bodies are already correctly filled in by their respective workers. Do not edit.

## Verification (must pass before you report done)
Run this single combined command and report the full result:
```
pytest docs/backend/tests/unit/test_file_loading.py docs/backend/tests/unit/test_chunking.py docs/backend/tests/unit/test_extraction.py docs/backend/tests/unit/test_graph_store.py docs/backend/tests/unit/test_vector_store.py docs/backend/tests/unit/test_entity_resolution.py docs/backend/tests/unit/test_retrieval.py docs/backend/tests/unit/test_answer_generation.py docs/backend/tests/integration/test_ingestion_pipeline.py docs/backend/tests/integration/test_entity_resolution_pipeline.py "docs/backend/tests/integration/test_rag_query_pipeline.py::test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end" docs/backend/tests/api/test_graph_read_endpoint.py -v
```
Expected: all tests pass except `test_entity_resolution.py::test_threshold_boundary_behavior_is_parameterized_not_hardcoded` (intentionally `skip`-marked, not a failure). Total should be roughly 22 + 5 + 8 + 3 + 3 + 2 + 1 + 4 = 51 passed, 1 skipped (recount yourself from actual collection — this is an estimate, not a hard assertion). If anything genuinely fails (not the one expected skip), diagnose and fix it — the two source workers each verified their own tests passing in isolation, so a failure here would mean an integration-level interaction bug between their two pieces of work, which is exactly what this merge step exists to catch.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-round3-conftest-merge-report.md`: confirmation of the 4 fixture changes applied, and the full verification command's exact output (pass/fail/skip counts and names of anything unexpected).
