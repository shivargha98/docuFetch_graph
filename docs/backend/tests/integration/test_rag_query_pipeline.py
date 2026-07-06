"""
Integration tests for the full RAG query pipeline: query -> vector-seeded
lookup -> bounded graph traversal -> no-match detection -> Haiku answer
generation -> sliding-window chat session, exercised end-to-end with mocked
LLM calls and a real (temporary) Chroma + graph store.
"""
import pytest


def test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end(
    sample_graph, chroma_test_client, mock_embedding_client, mock_traversal_llm, mock_haiku_client
):
    """
    Given an ingested graph/vector store with material relevant to a test
    query, mocked traversal-reasoning and Haiku responses,
    when a chat query is submitted,
    the query should be seeded from vector search, traversed (bounded 3
    hops/15 nodes), and answered, with the final answer 4-5 lines and grounded
    in the traversed context.

    Adds mock_embedding_client (an existing Round 2 fixture, not newly
    defined here) to the stub's original fixture list, since chroma_test_
    client's add_chunk/query calls go through openrouter_client.embed_text
    and must not hit the real network in a test.

    Source: Issue 11 — full acceptance criteria; PRD user stories 12, 13, 14
    """
    from backend.graph_store.store import GraphStore
    from backend.ingestion.chunking import Chunk
    from backend.query_service import answer_query

    graph_store = GraphStore(graph=sample_graph)

    mock_embedding_client.set_response([1.0, 0.0, 0.0])
    chunk = Chunk(
        chunk_id="chunk-ml",
        text="Machine Learning is a field of AI that learns from data.",
        source_file="file_a.md",
        section="Machine Learning",
    )
    chroma_test_client.add_chunk(chunk, ["concept_machine_learning"])

    mock_embedding_client.set_response([0.9, 0.05, 0.05])
    mock_traversal_llm.set_response({"next_node_id": None, "relation": None})
    mock_haiku_client.set_response(
        "Machine Learning is a field of AI.\n"
        "It focuses on building models that learn from data.\n"
        "It relates closely to Artificial Intelligence.\n"
        "This answer is grounded in the traversed graph context."
    )

    result = answer_query("What is Machine Learning?", graph_store, chroma_test_client)

    assert result["seeds"]
    assert result["seeds"][0]["node_id"] == "concept_machine_learning"
    assert result["traversal"]
    assert result["traversal"][0]["node_id"] == "concept_machine_learning"

    answer_lines = [line for line in result["answer"].splitlines() if line.strip()]
    assert 4 <= len(answer_lines) <= 5

    assert mock_haiku_client.calls
    context_passed = mock_haiku_client.calls[0][0]
    assert "Machine Learning" in context_passed


def test_query_with_no_relevant_material_returns_explicit_not_found_message(
    chroma_test_client, mock_embedding_client, no_match_cutoff
):
    """
    Given an ingested graph/vector store with no material relevant to a test
    query,
    when a chat query is submitted,
    traversal and the Haiku answer call should both be skipped, and the
    explicit "no relevant document found" message should be returned.

    Adds mock_embedding_client (an existing Round 2 fixture, not newly
    defined here) to the stub's original fixture list, following Round 3's
    precedent, since seed_from_query's call into chroma_test_client.query()
    goes through openrouter_client.embed_text and must not hit the real
    network in a test.

    Source: Issue 12 — criterion 1; PRD user story 15
    """
    from backend.graph_store.store import GraphStore
    from backend.no_match_detection import NOT_FOUND_MESSAGE
    from backend.query_service import answer_query

    graph_store = GraphStore()
    mock_embedding_client.set_response([1.0, 0.0, 0.0])

    result = answer_query(
        "What is quantum computing?",
        graph_store,
        chroma_test_client,
        folder_path="/no_match_integration_test_folder",
        cutoff=no_match_cutoff,
    )

    assert result["no_match"] is True
    assert result["answer"] == NOT_FOUND_MESSAGE
    assert result["traversal"] == []
    assert result["seeds"] == []


def test_borderline_query_caught_by_haiku_double_check(
    sample_graph, chroma_test_client, mock_embedding_client, mock_traversal_llm, mock_haiku_client, no_match_cutoff
):
    """
    Given a query whose vector search passes cutoff but whose traversed
    context doesn't actually answer the question (mocked Haiku judgment = not
    relevant),
    when a chat query is submitted,
    the explicit not-found message should be returned rather than a
    fabricated answer.

    Adds mock_embedding_client to the stub's original fixture list, following
    Round 3's precedent, since chroma_test_client's add_chunk/query calls go
    through openrouter_client.embed_text and must not hit the real network.

    Source: Issue 12 — criterion 2
    """
    from backend.graph_store.store import GraphStore
    from backend.ingestion.chunking import Chunk
    from backend.no_match_detection import NOT_FOUND_MESSAGE
    from backend.query_service import answer_query

    graph_store = GraphStore(graph=sample_graph)

    mock_embedding_client.set_response([1.0, 0.0, 0.0])
    chunk = Chunk(
        chunk_id="chunk-ml",
        text="Machine Learning is a field of AI that learns from data.",
        source_file="file_a.md",
        section="Machine Learning",
    )
    chroma_test_client.add_chunk(chunk, ["concept_machine_learning"])

    mock_embedding_client.set_response([0.9, 0.05, 0.05])
    mock_traversal_llm.set_response({"next_node_id": None, "relation": None})
    mock_haiku_client.set_relevance(False)

    result = answer_query(
        "What is Machine Learning?",
        graph_store,
        chroma_test_client,
        folder_path="/borderline_integration_test_folder",
        cutoff=no_match_cutoff,
    )

    assert result["no_match"] is True
    assert result["answer"] == NOT_FOUND_MESSAGE
    assert result["traversal"]
    assert mock_haiku_client.relevance_calls
    assert mock_haiku_client.calls == []


def test_followup_query_resolves_using_sliding_window_session_context(
    sample_graph, chroma_test_client, mock_embedding_client, mock_traversal_llm, mock_haiku_client
):
    """
    Given a prior turn established in an active session,
    when a follow-up query referencing that turn is submitted,
    the follow-up should resolve correctly using the prior turn as context
    (seeding + answer both reflecting it).

    Adds mock_embedding_client to the stub's original fixture list, following
    Round 3's precedent, since chroma_test_client's add_chunk/query calls go
    through openrouter_client.embed_text and must not hit the real network.

    Source: Issue 13 — criterion 1; PRD user story 16
    """
    from backend.graph_store.store import GraphStore
    from backend.ingestion.chunking import Chunk
    from backend.query_service import answer_query

    graph_store = GraphStore(graph=sample_graph)
    folder_path = "/followup_integration_test_folder"

    mock_embedding_client.set_response([1.0, 0.0, 0.0])
    chunk = Chunk(
        chunk_id="chunk-ml",
        text="Machine Learning is a field of AI that learns from data.",
        source_file="file_a.md",
        section="Machine Learning",
    )
    chroma_test_client.add_chunk(chunk, ["concept_machine_learning"])

    mock_embedding_client.set_response([0.9, 0.05, 0.05])
    mock_traversal_llm.set_response({"next_node_id": None, "relation": None})
    mock_haiku_client.set_response(
        "Machine Learning is a field of AI.\n"
        "It focuses on building models that learn from data.\n"
        "It relates closely to Artificial Intelligence.\n"
        "This answer is grounded in the traversed graph context."
    )

    first_result = answer_query(
        "What is Machine Learning?", graph_store, chroma_test_client, folder_path=folder_path
    )
    assert first_result["no_match"] is False

    mock_haiku_client.set_response(
        "It is part of the broader Artificial Intelligence field.\n"
        "It builds on the previously discussed concept.\n"
        "Still grounded in the traversed graph context.\n"
        "Fourth line of the summary."
    )

    second_result = answer_query(
        "What about its relation to Artificial Intelligence?",
        graph_store,
        chroma_test_client,
        folder_path=folder_path,
    )

    assert second_result["no_match"] is False
    assert mock_haiku_client.calls[-1][2] == [
        {"query": "What is Machine Learning?", "answer": first_result["answer"]}
    ]


def test_switching_folders_mid_conversation_starts_clean_session_end_to_end(
    sample_graph, chroma_test_client, mock_embedding_client, mock_traversal_llm, mock_haiku_client, tmp_watch_folder
):
    """
    Given an active session with turn history for folder A,
    when the folder is switched to folder B and a new query is submitted,
    the new query's context should contain no turn history from folder A.

    Adds mock_embedding_client to the stub's original fixture list, following
    Round 3's precedent, since chroma_test_client's add_chunk/query calls go
    through openrouter_client.embed_text and must not hit the real network.

    Source: Issue 13 — criterion 3; Issue 15 — criterion 3
    """
    from backend.graph_store.store import GraphStore
    from backend.ingestion.chunking import Chunk
    from backend.query_service import answer_query

    graph_store = GraphStore(graph=sample_graph)
    folder_a = str(tmp_watch_folder / "folder_a")
    folder_b = str(tmp_watch_folder / "folder_b")

    mock_embedding_client.set_response([1.0, 0.0, 0.0])
    chunk = Chunk(
        chunk_id="chunk-ml",
        text="Machine Learning is a field of AI that learns from data.",
        source_file="file_a.md",
        section="Machine Learning",
    )
    chroma_test_client.add_chunk(chunk, ["concept_machine_learning"])

    mock_embedding_client.set_response([0.9, 0.05, 0.05])
    mock_traversal_llm.set_response({"next_node_id": None, "relation": None})
    mock_haiku_client.set_response("Line one.\nLine two.\nLine three.\nLine four.")

    answer_query("What is Machine Learning?", graph_store, chroma_test_client, folder_path=folder_a)

    result = answer_query("What is Machine Learning?", graph_store, chroma_test_client, folder_path=folder_b)

    assert result["no_match"] is False
    assert mock_haiku_client.calls[-1][2] == []
