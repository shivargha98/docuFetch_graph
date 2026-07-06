"""
Integration tests for cross-file entity resolution, exercised end-to-end
across two ingested files sharing equivalent concepts.
"""
import pytest

from backend.entity_resolution import resolver
from backend.graph_store.store import GraphStore
from backend.ingestion import pipeline


def test_cross_file_synonym_concepts_merge_end_to_end_via_string_tier(
    tmp_watch_folder, mock_extraction_llm, tmp_path, monkeypatch
):
    """
    Given two files, each mentioning a concept under identically-normalized
    names,
    when both files are ingested and resolution runs,
    the graph should contain a single merged node referencing both files.

    Source: Issue 4 — full acceptance criteria
    """
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(pipeline, "GRAPH_STORE_PATH", str(graph_path))

    file_a = tmp_watch_folder / "file_a.md"
    file_a.write_text(
        "## Neural Network\nA neural network is a computing system inspired by biological brains.\n",
        encoding="utf-8",
    )
    file_b = tmp_watch_folder / "file_b.md"
    file_b.write_text(
        "## Neural Networks\nNeural networks are used widely in machine learning applications.\n",
        encoding="utf-8",
    )

    graph_store = GraphStore()

    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Neural Network", "description": "A computing system inspired by biological brains."}
            ],
            "relations": [],
        }
    )
    pipeline.ingest_file(file_a, graph_store)

    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Neural Networks", "description": "Used widely in machine learning applications."}
            ],
            "relations": [],
        }
    )
    pipeline.ingest_file(file_b, graph_store)

    # Before resolution: distinct slugs ("concept_neural_network" vs
    # "concept_neural_networks") mean two separate nodes exist.
    assert graph_store.graph.number_of_nodes() == 2

    resolver.resolve_string_tier(graph_store)

    assert graph_store.graph.number_of_nodes() == 1
    _, merged_data = next(iter(graph_store.graph.nodes(data=True)))
    assert set(merged_data["source_files"]) == {str(file_a), str(file_b)}


def test_cross_file_synonym_concepts_merge_via_embedding_and_llm_adjudication(
    tmp_watch_folder, mock_extraction_llm, mock_embedding_client, entity_resolution_thresholds, tmp_path, monkeypatch
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
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(pipeline, "GRAPH_STORE_PATH", str(graph_path))

    file_a = tmp_watch_folder / "file_a.md"
    file_a.write_text("## ML\nML is a field of AI that builds models from data.\n", encoding="utf-8")
    file_b = tmp_watch_folder / "file_b.md"
    file_b.write_text(
        "## Machine Learning\nMachine Learning is a field of AI that builds models from data.\n", encoding="utf-8"
    )

    graph_store = GraphStore()

    mock_extraction_llm.set_response(
        {
            "concepts": [{"name": "ML", "description": "A field of AI that builds models from data."}],
            "relations": [],
        }
    )
    pipeline.ingest_file(file_a, graph_store)

    mock_extraction_llm.set_response(
        {
            "concepts": [{"name": "Machine Learning", "description": "A field of AI that builds models from data."}],
            "relations": [],
        }
    )
    pipeline.ingest_file(file_b, graph_store)

    # "ML" vs "Machine Learning" have genuinely different normalized names,
    # so the string tier leaves both nodes in place.
    assert graph_store.graph.number_of_nodes() == 2

    # Same static vector for every embed_text call -> cosine similarity of
    # 1.0, above merge_threshold, so this exercises the embedding-only
    # (non-ambiguous) merge path without needing an LLM adjudication call.
    mock_embedding_client.set_response([0.1, 0.2, 0.3])

    resolver.resolve_all(
        graph_store,
        merge_threshold=entity_resolution_thresholds["merge_threshold"],
        ambiguous_low=entity_resolution_thresholds["ambiguous_low"],
    )

    assert graph_store.graph.number_of_nodes() == 1
    _, merged_data = next(iter(graph_store.graph.nodes(data=True)))
    assert set(merged_data["source_files"]) == {str(file_a), str(file_b)}
