"""
Shared pytest fixtures for the docuFetch Graph backend test suite.

This file stubs out the fixtures every test module in unit/, integration/, and
api/ will need: a temporary watched folder with sample files, mocked LLM/embedding
clients (OpenRouter extraction, OpenRouter embedding, OpenRouter traversal-reasoning,
Anthropic Haiku), a test Chroma client, sample networkx graphs, injectable
entity-resolution and no-match thresholds, and FastAPI/WebSocket test clients.

None of these fixtures are implemented yet (blank-slate repo, no backend code
exists) — signatures and docstrings describe what each fixture must provide once
the corresponding backend module exists.
"""
import pytest


@pytest.fixture(autouse=True)
def _store_paths_in_tmp(tmp_path, monkeypatch):
    """
    Suite-wide guard: point every persisted-store path at a per-test temp dir
    so no test can leak graph_store.json/hash_store.json/chroma_db into the
    repo root (the .env/config defaults). Two kinds of write site exist: code
    reading `config.*` at call time (e.g. config_routes.switch_to_folder),
    and modules that imported a path by name at import time
    (pipeline.GRAPH_STORE_PATH, watcher.GRAPH_STORE_PATH,
    vector_store.store.CHROMA_DB_PATH) — all are patched. Tests that need a
    specific path still monkeypatch their own on top of this.
    """
    from backend import config
    from backend.ingestion import pipeline as pipeline_module
    from backend.ingestion import watcher as watcher_module
    from backend.vector_store import store as vector_store_module

    monkeypatch.setattr(config, "GRAPH_STORE_PATH", str(tmp_path / "graph_store.json"))
    monkeypatch.setattr(config, "HASH_STORE_PATH", str(tmp_path / "hash_store.json"))
    monkeypatch.setattr(config, "CHROMA_DB_PATH", str(tmp_path / "chroma_db"))
    monkeypatch.setattr(pipeline_module, "GRAPH_STORE_PATH", str(tmp_path / "graph_store.json"))
    monkeypatch.setattr(watcher_module, "GRAPH_STORE_PATH", str(tmp_path / "graph_store.json"))
    monkeypatch.setattr(vector_store_module, "CHROMA_DB_PATH", str(tmp_path / "chroma_db"))


@pytest.fixture
def tmp_watch_folder(tmp_path):
    """
    Provide a temporary folder path to use as the watched folder for a test.

    Returns a `pathlib.Path` to an empty directory that tests can populate
    with sample files (markdown/txt/pdf) before pointing ingestion at it.
    """
    folder = tmp_path / "watch_folder"
    folder.mkdir()
    return folder


@pytest.fixture
def sample_markdown_file(tmp_watch_folder):
    """
    Write a sample `.md` file with two heading sections into
    `tmp_watch_folder` and return its path.

    Content contains two headings with distinct, extractable concepts
    ("Machine Learning" and "Artificial Intelligence") and a stated
    directional relation between them ("Machine Learning is part of
    Artificial Intelligence"), so extraction/chunking tests have
    deterministic expectations to assert against.
    """
    content = (
        "## Machine Learning\n"
        "Machine Learning is part of Artificial Intelligence. Machine "
        "Learning focuses on building models that learn from data.\n\n"
        "## Artificial Intelligence\n"
        "Artificial Intelligence is the broader field concerned with "
        "building systems that perform tasks requiring human-like "
        "reasoning.\n"
    )
    path = tmp_watch_folder / "sample.md"
    path.write_text(content, encoding="utf-8")
    return path


@pytest.fixture
def sample_txt_file(tmp_watch_folder):
    """
    Write a sample `.txt` file with multiple paragraphs (no heading markup)
    into `tmp_watch_folder` and return its path.
    """
    content = (
        "Photosynthesis is the process by which plants convert sunlight into "
        "chemical energy.\n\n"
        "Cellular respiration is the process by which cells break down "
        "glucose to release energy.\n\n"
        "Both processes are essential to life on Earth and are deeply "
        "interconnected in the global carbon cycle.\n"
    )
    path = tmp_watch_folder / "sample.txt"
    path.write_text(content, encoding="utf-8")
    return path


@pytest.fixture
def sample_pdf_file(tmp_watch_folder):
    """
    Write a sample `.pdf` file with clean heading structure into
    `tmp_watch_folder` and return its path.

    Uses fpdf2 to produce two sections, each with an 18pt heading line
    ("Machine Learning" / "Artificial Intelligence") followed by several
    sentences of wrapped 11pt body text, so `backend/ingestion/loaders.py`'s
    font-size heading heuristic (PDF_HEADING_FONT_RATIO = 1.2) unambiguously
    picks the 11pt body text as the modal/baseline size (it's the most
    common size across many wrapped body lines vs. two single-line
    headings) and flags the 18pt lines (18 / 11 ~= 1.64x >= 1.2x) as
    headings.
    """
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=18)
    pdf.cell(0, 10, "Machine Learning", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=11)
    pdf.multi_cell(
        0,
        6,
        "Machine learning is a field of artificial intelligence that focuses "
        "on building systems that learn from data. These systems improve "
        "their performance over time as they are exposed to more examples, "
        "without being explicitly programmed for every possible scenario "
        "they might encounter in the real world.",
    )
    pdf.ln(4)
    pdf.set_font("Helvetica", size=18)
    pdf.cell(0, 10, "Artificial Intelligence", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=11)
    pdf.multi_cell(
        0,
        6,
        "Artificial intelligence is the broader field concerned with "
        "building systems that perform tasks requiring human-like "
        "reasoning, perception, and decision making. It encompasses many "
        "subfields beyond machine learning, including planning, robotics, "
        "and natural language understanding.",
    )

    path = tmp_watch_folder / "sample.pdf"
    pdf.output(str(path))
    return path


@pytest.fixture
def sample_pdf_file_no_headings(tmp_watch_folder):
    """
    Write a sample `.pdf` file with uniform 11pt font throughout (no heading
    distinction) into `tmp_watch_folder` and return its path, so
    `_detect_pdf_heading_texts` finds no line clearing the
    PDF_HEADING_FONT_RATIO bar and `headings` comes back None, exercising the
    paragraph-fallback chunking path.

    Each paragraph is written as a single short text line (rather than a
    wrapped multi-line paragraph) with a clear vertical gap between
    paragraphs, so pdfplumber's layout-preserving extraction renders exactly
    one blank line between paragraphs and none within a paragraph.
    """
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, "This is the first paragraph of the document.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(12)
    pdf.cell(0, 8, "This is the second paragraph of the document.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(12)
    pdf.cell(0, 8, "This is the third and final paragraph of the document.", new_x="LMARGIN", new_y="NEXT")

    path = tmp_watch_folder / "sample_no_headings.pdf"
    pdf.output(str(path))
    return path


@pytest.fixture
def mock_extraction_llm(monkeypatch):
    """
    Provide a mocked OpenRouter extraction client (`OPENROUTER_LLM_MODEL`) whose
    response can be configured per-test to return a structured concept +
    typed-relation payload, or a malformed payload for error-handling tests.

    Monkeypatches `backend.clients.openrouter_client.extract_concepts` with a
    fake that returns a configurable value (or raises a configurable
    exception) instead of hitting the real network. Configure per test via
    `mock_extraction_llm.set_response(payload)` or
    `mock_extraction_llm.set_side_effect(exc)`.
    """
    from backend.clients import openrouter_client

    state = {"response": {"concepts": [], "relations": []}, "side_effect": None}

    def fake_extract_concepts(chunk_text: str) -> dict:
        """Stand-in for openrouter_client.extract_concepts that returns/raises whatever the test configured."""
        if state["side_effect"] is not None:
            raise state["side_effect"]
        return state["response"]

    def set_response(response):
        """Configure the dict (or malformed value) fake_extract_concepts should return on its next call."""
        state["response"] = response
        state["side_effect"] = None

    def set_side_effect(exc):
        """Configure an exception for fake_extract_concepts to raise on its next call."""
        state["side_effect"] = exc

    monkeypatch.setattr(openrouter_client, "extract_concepts", fake_extract_concepts)

    fake_extract_concepts.set_response = set_response
    fake_extract_concepts.set_side_effect = set_side_effect
    return fake_extract_concepts


@pytest.fixture
def mock_embedding_client(monkeypatch):
    """
    Provide a mocked OpenRouter embedding client (`OPENROUTER_EMBED_MODEL`)
    whose returned vectors can be configured per-test to produce controlled
    similarity scores between concepts/chunks.

    Monkeypatches `backend.clients.openrouter_client.embed_text` (same
    pattern as `mock_extraction_llm`): configure per test via
    `mock_embedding_client.set_response(vector)` or
    `mock_embedding_client.set_side_effect(exc)`. Since `embed_text` is
    called synchronously wherever code under test calls it, tests can call
    `set_response` again between calls (e.g. between successive
    `add_chunk` calls) to give different chunks different vectors before
    querying. Defaults to a fixed vector so tests that don't care about
    specific values still work.
    """
    from backend.clients import openrouter_client

    state = {"response": [0.1, 0.2, 0.3], "side_effect": None}

    def fake_embed_text(text: str) -> list[float]:
        """Stand-in for openrouter_client.embed_text that returns/raises whatever the test configured."""
        if state["side_effect"] is not None:
            raise state["side_effect"]
        return state["response"]

    def set_response(vector):
        """Configure the vector fake_embed_text should return on its next call."""
        state["response"] = vector
        state["side_effect"] = None

    def set_side_effect(exc):
        """Configure an exception for fake_embed_text to raise on its next call."""
        state["side_effect"] = exc

    monkeypatch.setattr(openrouter_client, "embed_text", fake_embed_text)

    fake_embed_text.set_response = set_response
    fake_embed_text.set_side_effect = set_side_effect
    return fake_embed_text


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
    what was actually passed to the answer call.

    Also monkeypatches `backend.clients.anthropic_client.judge_relevance` (the
    Issue 12 double-check) with a fake exposing `.set_relevance(bool)` to
    configure its verdict per-test, defaulting to True ("relevant") so any
    test using this fixture without explicitly configuring a verdict gets the
    permissive default and proceeds to `generate_answer` unchanged - this is
    what keeps Round 3's integration test green without modifying it. Every
    call is recorded in `.relevance_calls` as a `(context, query)` tuple so
    tests can assert whether/how `judge_relevance` was invoked.
    """
    from backend.clients import anthropic_client

    state = {"response": "Line one.\nLine two.\nLine three.\nLine four.", "side_effect": None}
    relevance_state = {"verdict": True}

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

    def fake_judge_relevance(context, query):
        """Stand-in for anthropic_client.judge_relevance; records the call and returns whatever verdict the test configured (default True)."""
        fake_judge_relevance.relevance_calls.append((context, query))
        return relevance_state["verdict"]

    def set_relevance(verdict):
        """Configure the bool fake_judge_relevance should return on subsequent calls."""
        relevance_state["verdict"] = verdict

    monkeypatch.setattr(anthropic_client, "generate_answer", fake_generate_answer)
    monkeypatch.setattr(anthropic_client, "judge_relevance", fake_judge_relevance)

    fake_generate_answer.calls = []
    fake_generate_answer.set_response = set_response
    fake_generate_answer.set_side_effect = set_side_effect
    fake_generate_answer.relevance_calls = fake_judge_relevance.relevance_calls = []
    fake_generate_answer.set_relevance = set_relevance
    return fake_generate_answer


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


@pytest.fixture
def chroma_test_client(tmp_path):
    """
    Provide a real Chroma client backed by a temporary on-disk path (isolated
    per test), for tests that exercise actual embedding storage/retrieval
    rather than mocking Chroma itself.

    Returns a ready-to-use `VectorStore` instance pointed at a temp
    directory (`VectorStore.__init__` accepts an overridable `path`,
    defaulting to `CHROMA_DB_PATH` in normal use).
    """
    from backend.vector_store.store import VectorStore

    return VectorStore(path=str(tmp_path / "chroma_test"))


@pytest.fixture
def empty_graph():
    """
    Provide a fresh, empty networkx graph instance matching the concept-graph
    schema (nodes = concepts, edges = typed relations) used by graph_store.
    """
    import networkx as nx

    return nx.MultiDiGraph()


@pytest.fixture
def sample_graph(empty_graph):
    """
    Provide a small pre-populated networkx graph: 3 concept nodes and 2 typed
    edges spanning two source files. "Machine Learning" is shared between
    file_a.md and file_b.md; "Artificial Intelligence" is referenced only by
    file_a.md; "Neural Networks" is referenced only by file_b.md. This shape
    supports both merge tests (a node to merge into another) and delete tests
    (a node solely attributable to one file vs. a shared node).
    """
    graph = empty_graph
    graph.add_node(
        "concept_machine_learning",
        id="concept_machine_learning",
        name="Machine Learning",
        description="A field of AI focused on building models that learn from data.",
        source_files=["file_a.md", "file_b.md"],
    )
    graph.add_node(
        "concept_artificial_intelligence",
        id="concept_artificial_intelligence",
        name="Artificial Intelligence",
        description="The broader field concerned with building intelligent systems.",
        source_files=["file_a.md"],
    )
    graph.add_node(
        "concept_neural_networks",
        id="concept_neural_networks",
        name="Neural Networks",
        description="A machine learning technique loosely modeled on the brain.",
        source_files=["file_b.md"],
    )
    graph.add_edge("concept_machine_learning", "concept_artificial_intelligence", relation="part_of")
    graph.add_edge("concept_neural_networks", "concept_machine_learning", relation="part_of")
    return graph


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


@pytest.fixture
def no_match_cutoff():
    """
    Provide an injectable no-match similarity-cutoff configuration value so
    tests can exercise pass/fail behavior without hardcoding a specific cutoff.

    Returns `backend.config.NO_MATCH_SIMILARITY_CUTOFF` (0.35), per
    backend_context.md decision #3. The exact numeric value is still an open
    empirical-tuning question; this fixture just injects whatever the current
    configured default is rather than hardcoding a duplicate guess in tests.
    """
    from backend.config import NO_MATCH_SIMILARITY_CUTOFF

    return NO_MATCH_SIMILARITY_CUTOFF


@pytest.fixture
def fastapi_test_client():
    """
    Provide a FastAPI `TestClient` wired to the backend app, for API/contract
    tests against HTTP endpoints.
    """
    from fastapi.testclient import TestClient

    from backend.main import app

    return TestClient(app)


@pytest.fixture
def ws_test_client(fastapi_test_client):
    """
    Provide a WebSocket test client connected to the chat/traversal-streaming
    endpoint, for API/contract tests asserting streamed traversal-step events.

    Returns `fastapi_test_client` itself: Starlette's `TestClient` already
    supports `.websocket_connect(path)` as a context manager yielding an
    object with `.send_json(...)`/`.receive_json()`, so test bodies can call
    `ws_test_client.websocket_connect("/ws/chat")` directly without a
    separate wrapper.
    """
    return fastapi_test_client
