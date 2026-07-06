"""
Integration tests for the full RAG query pipeline: query -> vector-seeded
lookup -> bounded graph traversal -> no-match detection -> Haiku answer
generation -> sliding-window chat session, exercised end-to-end with mocked
LLM calls and a real (temporary) Chroma + graph store.
"""
import pytest


def test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end(
    sample_graph, chroma_test_client, mock_traversal_llm, mock_haiku_client
):
    """
    Given an ingested graph/vector store with material relevant to a test
    query, mocked traversal-reasoning and Haiku responses,
    when a chat query is submitted,
    the query should be seeded from vector search, traversed (bounded 3
    hops/15 nodes), and answered, with the final answer 4-5 lines and grounded
    in the traversed context.

    Source: Issue 11 — full acceptance criteria; PRD user stories 12, 13, 14
    """
    raise NotImplementedError


def test_query_with_no_relevant_material_returns_explicit_not_found_message(
    chroma_test_client, no_match_cutoff
):
    """
    Given an ingested graph/vector store with no material relevant to a test
    query,
    when a chat query is submitted,
    traversal and the Haiku answer call should both be skipped, and the
    explicit "no relevant document found" message should be returned.

    Source: Issue 12 — criterion 1; PRD user story 15
    """
    raise NotImplementedError


def test_borderline_query_caught_by_haiku_double_check(
    sample_graph, chroma_test_client, mock_traversal_llm, mock_haiku_client, no_match_cutoff
):
    """
    Given a query whose vector search passes cutoff but whose traversed
    context doesn't actually answer the question (mocked Haiku judgment = not
    relevant),
    when a chat query is submitted,
    the explicit not-found message should be returned rather than a
    fabricated answer.

    Source: Issue 12 — criterion 2
    """
    raise NotImplementedError


def test_followup_query_resolves_using_sliding_window_session_context(
    sample_graph, chroma_test_client, mock_traversal_llm, mock_haiku_client
):
    """
    Given a prior turn established in an active session,
    when a follow-up query referencing that turn is submitted,
    the follow-up should resolve correctly using the prior turn as context
    (seeding + answer both reflecting it).

    Source: Issue 13 — criterion 1; PRD user story 16
    """
    raise NotImplementedError


def test_switching_folders_mid_conversation_starts_clean_session_end_to_end(
    sample_graph, chroma_test_client, mock_traversal_llm, mock_haiku_client, tmp_watch_folder
):
    """
    Given an active session with turn history for folder A,
    when the folder is switched to folder B and a new query is submitted,
    the new query's context should contain no turn history from folder A.

    Source: Issue 13 — criterion 3; Issue 15 — criterion 3
    """
    raise NotImplementedError
