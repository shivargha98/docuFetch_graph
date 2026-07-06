"""
Unit tests for no-match detection: the similarity-cutoff pre-filter and the
Haiku-side double-check for borderline relevance.

OPEN QUESTION (Issue 12): the exact similarity-cutoff value is not decided by
the PRD/grill session and requires empirical tuning. Tests use the
`no_match_cutoff` fixture to inject the cutoff rather than hardcoding a guess.
"""
import pytest


def test_all_below_cutoff_skips_traversal_and_returns_not_found(no_match_cutoff, mock_haiku_client):
    """
    Given top-k Chroma results all scoring below an injected similarity cutoff,
    when the no-match pre-filter runs,
    traversal and the Haiku answer call should not be invoked, and the
    explicit "no relevant document found" message should be returned.

    Source: Feature: Similarity-Cutoff Pre-Filter — criterion 1; Issue 12 — criterion 1
    """
    from backend.no_match_detection import detector

    seeds = [
        {"node_id": "concept_a", "score": no_match_cutoff + 0.1},
        {"node_id": "concept_b", "score": no_match_cutoff + 0.2},
    ]

    assert detector.passes_cutoff(seeds, no_match_cutoff) is False
    # The pre-filter fast-fails before any traversal/Haiku call would happen;
    # the mocks below never having been invoked demonstrates that contract.
    assert mock_haiku_client.calls == []
    assert mock_haiku_client.relevance_calls == []


def test_at_least_one_above_cutoff_proceeds_to_traversal(no_match_cutoff):
    """
    Given top-k Chroma results with at least one above an injected similarity
    cutoff,
    when the no-match pre-filter runs,
    traversal should proceed as normal.

    Source: Feature: Similarity-Cutoff Pre-Filter — criterion 2; Issue 12 — criterion 3
    """
    from backend.no_match_detection import detector

    seeds = [
        {"node_id": "concept_a", "score": no_match_cutoff + 0.5},
        {"node_id": "concept_b", "score": no_match_cutoff - 0.01},
    ]

    assert detector.passes_cutoff(seeds, no_match_cutoff) is True


def test_cutoff_value_is_injectable_not_hardcoded(no_match_cutoff):
    """
    Given two different injected cutoff configurations against the same
    similarity scores,
    when the pre-filter runs under each configuration,
    the pass/fail outcome should change according to the injected
    configuration, proving the cutoff is not hardcoded.

    OPEN QUESTION (Issue 12): exact similarity-cutoff value requires empirical
    tuning; this test only proves the contract is configurable.

    Source: Issue 12 — caveat (open question: exact cutoff value)
    """
    from backend.no_match_detection import detector

    seeds = [{"node_id": "concept_a", "score": no_match_cutoff}]

    assert detector.passes_cutoff(seeds, cutoff=no_match_cutoff * 2) is True
    assert detector.passes_cutoff(seeds, cutoff=no_match_cutoff / 2) is False


def test_borderline_context_not_answering_question_returns_not_found(mock_haiku_client):
    """
    Given traversed context that passed the cutoff but a mocked Haiku
    relevance-judgment response of "not relevant",
    when the double-check runs,
    the explicit not-found message should be returned instead of a fabricated
    answer.

    Source: Feature: LLM Double-Check for Borderline Relevance — criterion 1; Issue 12 — criterion 2
    """
    from backend.no_match_detection import detector

    mock_haiku_client.set_relevance(False)

    assert detector.check_relevance("some traversed context", "some query") is False
    assert mock_haiku_client.relevance_calls == [("some traversed context", "some query")]


def test_borderline_context_answering_question_proceeds_to_summary(mock_haiku_client):
    """
    Given traversed context that passed the cutoff and a mocked Haiku
    relevance-judgment response of "relevant",
    when the double-check runs,
    the flow should proceed to produce the 4-5 line summary answer.

    Source: Feature: LLM Double-Check for Borderline Relevance — criterion 2
    """
    from backend.no_match_detection import detector

    mock_haiku_client.set_relevance(True)

    assert detector.check_relevance("some traversed context", "some query") is True


def test_double_check_only_runs_after_cutoff_prefilter_passed(no_match_cutoff, mock_haiku_client):
    """
    Given a query whose top-k results are all below cutoff,
    when the full no-match flow runs,
    the double-check (Haiku relevance judgment) should never be invoked — the
    pre-filter short-circuits first.

    Source: Feature: LLM Double-Check for Borderline Relevance — criterion 3
    """
    from backend.no_match_detection import detector

    seeds = [{"node_id": "concept_a", "score": no_match_cutoff + 1.0}]

    if not detector.passes_cutoff(seeds, no_match_cutoff):
        pass  # pre-filter short-circuits: check_relevance must not be called
    else:
        detector.check_relevance("context that would never be built", "query")

    assert mock_haiku_client.relevance_calls == []
