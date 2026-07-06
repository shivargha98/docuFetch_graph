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
    raise NotImplementedError


@pytest.fixture
def sample_pdf_file(tmp_watch_folder):
    """
    Write a sample `.pdf` file into `tmp_watch_folder` and return its path.

    Should provide two variants via parametrization or separate fixtures if
    needed: one with clean heading markup, one without (to exercise the
    paragraph-fallback chunking path).
    """
    raise NotImplementedError


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
def mock_embedding_client():
    """
    Provide a mocked OpenRouter embedding client (`OPENROUTER_EMBED_MODEL`)
    whose returned vectors can be configured per-test to produce controlled
    similarity scores between concepts/chunks.
    """
    raise NotImplementedError


@pytest.fixture
def mock_traversal_llm():
    """
    Provide a mocked OpenRouter traversal-reasoning client (`OPENROUTER_LLM_MODEL`,
    used in its traversal-reasoning role) whose "next edge to follow" decision
    can be configured per-test.
    """
    raise NotImplementedError


@pytest.fixture
def mock_haiku_client():
    """
    Provide a mocked Anthropic client (`ANTHROPIC_MODEL=claude-haiku-4-5`) whose
    final-answer response (or relevance double-check verdict) can be configured
    per-test.
    """
    raise NotImplementedError


@pytest.fixture
def chroma_test_client(tmp_path):
    """
    Provide a real Chroma client backed by a temporary on-disk path (isolated
    per test), for tests that exercise actual embedding storage/retrieval
    rather than mocking Chroma itself.
    """
    raise NotImplementedError


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
    Provide an injectable entity-resolution threshold configuration object
    (merge threshold, ambiguous-band lower/upper bounds) so tests can exercise
    boundary behavior without hardcoding specific values in test bodies.

    OPEN QUESTION (Issue 5): exact threshold values are not yet decided;
    this fixture's defaults are placeholders for boundary-behavior testing only.
    """
    raise NotImplementedError


@pytest.fixture
def no_match_cutoff():
    """
    Provide an injectable no-match similarity-cutoff configuration value so
    tests can exercise pass/fail behavior without hardcoding a specific cutoff.

    OPEN QUESTION (Issue 12): exact cutoff value is not yet decided; this
    fixture's default is a placeholder for behavior testing only.
    """
    raise NotImplementedError


@pytest.fixture
def fastapi_test_client():
    """
    Provide a FastAPI `TestClient` (or `httpx.AsyncClient`) wired to the backend
    app, for API/contract tests against HTTP endpoints.
    """
    raise NotImplementedError


@pytest.fixture
def ws_test_client(fastapi_test_client):
    """
    Provide a WebSocket test client connected to the chat/traversal-streaming
    endpoint, for API/contract tests asserting streamed traversal-step events.
    """
    raise NotImplementedError
