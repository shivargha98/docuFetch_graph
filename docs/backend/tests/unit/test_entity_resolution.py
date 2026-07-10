"""
Unit tests for the tiered entity-resolution pipeline: normalized string match,
embedding similarity, and LLM adjudication for the ambiguous middle band.

OPEN QUESTION (Issue 5): exact similarity thresholds (merge threshold, ambiguous
band bounds) are not decided by the PRD/grill session and require empirical
tuning. Tests here use the `entity_resolution_thresholds` fixture to inject
threshold values rather than hardcoding guesses, so the suite documents the
expected *behavior* around whatever threshold is eventually chosen.
"""
from unittest.mock import MagicMock, patch

import pytest

from backend.entity_resolution import resolver
from backend.graph_store.store import GraphStore


def _make_graph_store(nodes):
    """
    Build a GraphStore populated with the given nodes and no edges, for
    tests that only need node data (name/description/source_files) to
    exercise entity-resolution logic directly, without going through the
    ingestion pipeline. `nodes` is a list of
    (node_id, name, description, source_files) tuples.
    """
    store = GraphStore()
    for node_id, name, description, source_files in nodes:
        store.graph.add_node(
            node_id,
            id=node_id,
            name=name,
            description=description,
            source_files=list(source_files),
        )
    return store


def _embed_by_name(vectors_by_name):
    """
    Build a stand-in for openrouter_client.embed_text that returns a preset
    vector depending on which node's "{name}: {description}" text it was
    called with (matched by the text's name prefix), so a single test can
    give two different nodes two different embeddings - something the
    shared `mock_embedding_client` fixture's single static response can't do
    within one resolver call.
    """

    def _fake_embed_text(text):
        for name, vector in vectors_by_name.items():
            if text.startswith(f"{name}:"):
                return vector
        raise AssertionError(f"unexpected embed_text call for text: {text!r}")

    return _fake_embed_text


def test_identical_normalized_names_merge_without_llm_call(mock_adjudication_llm):
    """
    Given two concept nodes whose names differ only by case/whitespace/simple
    pluralization,
    when entity resolution runs,
    the two nodes should be merged into one and no LLM adjudication call made.

    Source: Feature: Tiered Entity Resolution Pipeline — criterion 1; Issue 4 — criterion 1
    """
    store = _make_graph_store(
        [
            ("concept_neural_network", "Neural Network", "A brain-inspired computing system.", ["file_a.md"]),
            ("concept_neural_networks", "Neural Networks", "A brain-inspired computing system.", ["file_b.md"]),
        ]
    )

    merges = resolver.resolve_string_tier(store)

    assert len(merges) == 1
    assert store.graph.number_of_nodes() == 1
    assert mock_adjudication_llm.calls == []


def test_different_normalized_names_are_not_over_merged():
    """
    Given two concept nodes with genuinely different normalized names,
    when the string-match tier runs,
    the two nodes should remain separate.

    Source: Issue 4 — criterion 3
    """
    store = _make_graph_store(
        [
            ("concept_machine_learning", "Machine Learning", "A field of AI.", ["file_a.md"]),
            ("concept_neural_networks", "Neural Networks", "A ML technique.", ["file_b.md"]),
        ]
    )

    merges = resolver.find_string_tier_merges(store)

    assert merges == []
    assert store.graph.number_of_nodes() == 2


def test_high_embedding_similarity_merges_without_llm_call(mock_embedding_client, entity_resolution_thresholds):
    """
    Given two concepts with embedding similarity above the injected merge
    threshold (e.g. "ML" vs "Machine Learning"),
    when the embedding-similarity tier runs,
    the two nodes should be merged and no LLM adjudication call made.

    Source: Feature: Tiered Entity Resolution Pipeline — criterion 2; Issue 5 — criterion 1
    """
    store = _make_graph_store(
        [
            ("concept_ml", "ML", "A field of AI that builds models from data.", ["file_a.md"]),
            ("concept_machine_learning", "Machine Learning", "A field of AI that builds models from data.", ["file_b.md"]),
        ]
    )
    # Same vector for every embed_text call -> cosine similarity of 1.0, above merge_threshold.
    mock_embedding_client.set_response([0.6, 0.8])

    spy_adjudicate = MagicMock()
    with patch("backend.clients.openrouter_client.adjudicate_merge", spy_adjudicate):
        merges = resolver.resolve_embedding_tier(
            store,
            merge_threshold=entity_resolution_thresholds["merge_threshold"],
            ambiguous_low=entity_resolution_thresholds["ambiguous_low"],
        )

    assert len(merges) == 1
    assert store.graph.number_of_nodes() == 1
    spy_adjudicate.assert_not_called()


def test_ambiguous_band_similarity_triggers_llm_adjudication(
    mock_embedding_client, entity_resolution_thresholds, mock_adjudication_llm
):
    """
    Given two concepts with similarity in the injected ambiguous middle band and
    a mocked LLM adjudication response,
    when entity resolution runs,
    an LLM adjudication call should be made and the graph should reflect that
    call's decision (merged or kept separate).

    Source: Feature: Tiered Entity Resolution Pipeline — criterion 3; Issue 5 — criterion 2
    """
    store = _make_graph_store(
        [
            ("concept_ml", "ML", "A field of AI.", ["file_a.md"]),
            ("concept_machine_learning", "Machine Learning", "A field of AI.", ["file_b.md"]),
        ]
    )
    # cosine similarity([1.0, 0.0], [0.8, 0.6]) == 0.8, inside the default [0.75, 0.90) ambiguous band.
    vectors = {"ML": [1.0, 0.0], "Machine Learning": [0.8, 0.6]}
    mock_adjudication_llm.set_response({"merge": True})

    with patch("backend.clients.openrouter_client.embed_text", side_effect=_embed_by_name(vectors)):
        merges = resolver.resolve_embedding_tier(
            store,
            merge_threshold=entity_resolution_thresholds["merge_threshold"],
            ambiguous_low=entity_resolution_thresholds["ambiguous_low"],
        )

    assert len(mock_adjudication_llm.calls) == 1
    assert len(merges) == 1
    assert store.graph.number_of_nodes() == 1


def test_low_similarity_concepts_left_unmerged_without_llm_call(mock_embedding_client, entity_resolution_thresholds):
    """
    Given two concepts with embedding similarity below the injected ambiguous
    band,
    when entity resolution runs,
    the two nodes should remain separate and no LLM adjudication call made.

    Source: Issue 5 — criterion 3
    """
    store = _make_graph_store(
        [
            ("concept_neural_network", "Neural Network", "A brain-inspired computing system.", ["file_a.md"]),
            ("concept_photosynthesis", "Photosynthesis", "How plants convert sunlight into energy.", ["file_b.md"]),
        ]
    )
    # Orthogonal vectors -> cosine similarity of 0.0, below the default ambiguous_low of 0.75.
    vectors = {"Neural Network": [1.0, 0.0], "Photosynthesis": [0.0, 1.0]}

    spy_adjudicate = MagicMock()
    with patch("backend.clients.openrouter_client.embed_text", side_effect=_embed_by_name(vectors)), patch(
        "backend.clients.openrouter_client.adjudicate_merge", spy_adjudicate
    ):
        merges = resolver.resolve_embedding_tier(
            store,
            merge_threshold=entity_resolution_thresholds["merge_threshold"],
            ambiguous_low=entity_resolution_thresholds["ambiguous_low"],
        )

    assert merges == []
    assert store.graph.number_of_nodes() == 2
    spy_adjudicate.assert_not_called()


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
    store = _make_graph_store(
        [
            ("concept_neural_network", "Neural Network", "A brain-inspired computing system.", ["file_a.md"]),
            ("concept_neural_networks", "Neural Networks", "A brain-inspired computing system.", ["file_b.md"]),
        ]
    )

    resolver.resolve_string_tier(store)

    assert store.graph.number_of_nodes() == 1
    _, remaining_data = next(iter(store.graph.nodes(data=True)))
    assert set(remaining_data["source_files"]) == {"file_a.md", "file_b.md"}


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


def test_embedding_tier_honors_the_adjudication_cap(entity_resolution_thresholds, mock_adjudication_llm):
    """
    Given three ambiguous pairs but a cap of one adjudication,
    when the embedding tier runs,
    only one LLM call is made and the un-adjudicated pairs are left
    unmerged — bounded ingestion beats perfect deduplication.
    """
    store = _make_graph_store(
        [
            ("concept_a", "Alpha", "First concept.", ["a.md"]),
            ("concept_b", "Beta", "Second concept.", ["b.md"]),
            ("concept_c", "Gamma", "Third concept.", ["c.md"]),
        ]
    )
    # All three pairwise similarities are identical (cos = 0.8), inside the
    # injected [0.75, 0.90) ambiguous band.
    vectors = {"Alpha": [1.0, 0.0], "Beta": [0.8, 0.6], "Gamma": [1.0, 0.0]}
    # Pair (Alpha, Gamma) has cos 1.0 -> auto-merge; make Gamma distinct instead.
    vectors["Gamma"] = [0.8, -0.6]
    mock_adjudication_llm.set_response({"merge": False})

    with patch("backend.clients.openrouter_client.embed_text", side_effect=_embed_by_name(vectors)):
        merges = resolver.resolve_embedding_tier(
            store,
            merge_threshold=entity_resolution_thresholds["merge_threshold"],
            ambiguous_low=entity_resolution_thresholds["ambiguous_low"],
            max_adjudications=1,
        )

    assert len(mock_adjudication_llm.calls) == 1
    assert merges == []
    assert store.graph.number_of_nodes() == 3
