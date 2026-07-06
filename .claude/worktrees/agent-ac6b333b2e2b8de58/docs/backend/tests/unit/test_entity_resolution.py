"""
Unit tests for the tiered entity-resolution pipeline: normalized string match,
embedding similarity, and LLM adjudication for the ambiguous middle band.

OPEN QUESTION (Issue 5): exact similarity thresholds (merge threshold, ambiguous
band bounds) are not decided by the PRD/grill session and require empirical
tuning. Tests here use the `entity_resolution_thresholds` fixture to inject
threshold values rather than hardcoding guesses, so the suite documents the
expected *behavior* around whatever threshold is eventually chosen.
"""
import pytest


def test_identical_normalized_names_merge_without_llm_call(mock_traversal_llm):
    """
    Given two concept nodes whose names differ only by case/whitespace/simple
    pluralization,
    when entity resolution runs,
    the two nodes should be merged into one and no LLM adjudication call made.

    Source: Feature: Tiered Entity Resolution Pipeline — criterion 1; Issue 4 — criterion 1
    """
    raise NotImplementedError


def test_different_normalized_names_are_not_over_merged():
    """
    Given two concept nodes with genuinely different normalized names,
    when the string-match tier runs,
    the two nodes should remain separate.

    Source: Issue 4 — criterion 3
    """
    raise NotImplementedError


def test_high_embedding_similarity_merges_without_llm_call(mock_embedding_client, entity_resolution_thresholds):
    """
    Given two concepts with embedding similarity above the injected merge
    threshold (e.g. "ML" vs "Machine Learning"),
    when the embedding-similarity tier runs,
    the two nodes should be merged and no LLM adjudication call made.

    Source: Feature: Tiered Entity Resolution Pipeline — criterion 2; Issue 5 — criterion 1
    """
    raise NotImplementedError


def test_ambiguous_band_similarity_triggers_llm_adjudication(mock_embedding_client, entity_resolution_thresholds):
    """
    Given two concepts with similarity in the injected ambiguous middle band and
    a mocked LLM adjudication response,
    when entity resolution runs,
    an LLM adjudication call should be made and the graph should reflect that
    call's decision (merged or kept separate).

    Source: Feature: Tiered Entity Resolution Pipeline — criterion 3; Issue 5 — criterion 2
    """
    raise NotImplementedError


def test_low_similarity_concepts_left_unmerged_without_llm_call(mock_embedding_client, entity_resolution_thresholds):
    """
    Given two concepts with embedding similarity below the injected ambiguous
    band,
    when entity resolution runs,
    the two nodes should remain separate and no LLM adjudication call made.

    Source: Issue 5 — criterion 3
    """
    raise NotImplementedError


def test_merging_preserves_source_file_references_from_both_nodes():
    """
    Given two concept nodes from different source files that are merged (via
    any tier),
    when the merge is applied,
    the resulting node's source-file references should include both original
    files' references.

    Source: Feature: Tiered Entity Resolution Pipeline — criterion 4; Issue 4 —
    criterion 2; Issue 5 — criterion 4
    """
    raise NotImplementedError


@pytest.mark.skip(reason="OPEN QUESTION (Issue 5): exact threshold values require empirical tuning")
def test_threshold_boundary_behavior_is_parameterized_not_hardcoded(entity_resolution_thresholds):
    """
    Given a similarity score exactly at an injected threshold boundary value,
    when the resolution tier evaluates it,
    the test suite should document which side of the boundary is inclusive,
    driven by the injected config value rather than a hardcoded number.

    OPEN QUESTION (Issue 5): exact threshold values require empirical tuning;
    unskip and fill in once thresholds are decided.

    Source: Issue 5 — caveat (open question: exact threshold values)
    """
    raise NotImplementedError
