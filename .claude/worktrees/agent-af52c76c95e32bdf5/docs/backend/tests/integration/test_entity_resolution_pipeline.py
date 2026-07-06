"""
Integration tests for cross-file entity resolution, exercised end-to-end
across two ingested files sharing equivalent concepts.
"""
import pytest


def test_cross_file_synonym_concepts_merge_end_to_end_via_string_tier(
    tmp_watch_folder, mock_extraction_llm
):
    """
    Given two files, each mentioning a concept under identically-normalized
    names,
    when both files are ingested and resolution runs,
    the graph should contain a single merged node referencing both files.

    Source: Issue 4 — full acceptance criteria
    """
    raise NotImplementedError


def test_cross_file_synonym_concepts_merge_via_embedding_and_llm_adjudication(
    tmp_watch_folder, mock_extraction_llm, mock_embedding_client, entity_resolution_thresholds
):
    """
    Given two files mentioning conceptually equivalent but differently-worded
    concepts (e.g. "ML" / "Machine Learning"), with mocked embedding
    similarity and (if ambiguous) mocked LLM adjudication,
    when both files are ingested and resolution runs,
    the graph should contain a single merged node referencing both files, and
    the adjudication path taken (embedding-only vs. LLM-adjudicated) should
    match the mocked similarity band.

    Source: Issue 5 — full acceptance criteria
    """
    raise NotImplementedError
