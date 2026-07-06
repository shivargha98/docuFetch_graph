"""
Unit tests for the graph_store module: networkx + JSON persistence, and
applying extraction/entity-resolution/deletion results as graph updates.
"""
import pytest

from backend.extraction.extractor import ExtractionResult
from backend.graph_store.store import GraphStore
from backend.ingestion.chunking import Chunk


def test_graph_round_trips_through_json_persistence(sample_graph, tmp_path):
    """
    Given an in-memory networkx graph with nodes and typed edges,
    when the graph is persisted to JSON and reloaded,
    the reloaded graph should have the same nodes and edges as the original.

    Source: Feature: Concept Graph Persistence — criterion 1; Issue 1 — criterion 4
    """
    store = GraphStore(graph=sample_graph)
    path = tmp_path / "graph.json"

    store.persist(path)
    reloaded = GraphStore.load(path)

    assert sorted(reloaded.graph.nodes()) == sorted(store.graph.nodes())
    assert sorted(reloaded.graph.edges()) == sorted(store.graph.edges())


def test_reloaded_node_data_includes_id_field_after_json_round_trip(sample_graph, tmp_path):
    """
    Given a graph persisted to JSON and reloaded via GraphStore.load,
    when each reloaded node's data is inspected,
    it should still have an "id" field equal to its own graph key.

    Regression test: networkx.node_link_graph reserves the "id" field to name
    the node on reload and does not copy it back into the node's data dict,
    so GraphStore.load must backfill it. Surfaced by Round 2's worker-graph-api
    while building GET /api/graph.

    Source: Feature: Concept Graph Persistence — criterion 2
    """
    store = GraphStore(graph=sample_graph)
    path = tmp_path / "graph.json"

    store.persist(path)
    reloaded = GraphStore.load(path)

    for node_id, data in reloaded.graph.nodes(data=True):
        assert data["id"] == node_id


def test_persisted_node_data_includes_required_fields(sample_graph):
    """
    Given a graph node created during ingestion,
    when the node is inspected,
    it should have an id, name, description, and at least one source-file
    reference.

    Source: Feature: Concept Graph Persistence — criterion 2
    """
    store = GraphStore(graph=sample_graph)

    for node_id, data in store.graph.nodes(data=True):
        assert data["id"] == node_id
        assert data["name"]
        assert data["description"] is not None
        assert len(data["source_files"]) >= 1


def test_persisted_edge_data_includes_required_fields(sample_graph):
    """
    Given a graph edge created during extraction,
    when the edge is inspected,
    it should have a typed relation label and source/target node ids.

    Source: Feature: Concept Graph Persistence — criterion 3
    """
    store = GraphStore(graph=sample_graph)

    for source, target, data in store.graph.edges(data=True):
        assert source
        assert target
        assert data["relation"]


def test_new_concepts_added_as_new_nodes_with_correct_edges(empty_graph):
    """
    Given extraction output for a newly ingested file (concepts + relations),
    when the graph update step applies this output,
    new nodes should appear for each new concept and edges should match the
    relations extracted.

    Source: Feature: Graph Update on Ingestion Events — criterion 1
    """
    store = GraphStore(graph=empty_graph)
    chunk = Chunk(chunk_id="c1", text="...", source_file="file_new.md", section=None)
    result = ExtractionResult(
        concepts=[
            {"name": "Quantum Computing", "description": "..."},
            {"name": "Qubits", "description": "..."},
        ],
        relations=[{"source": "Quantum Computing", "target": "Qubits", "relation": "uses"}],
    )

    node_ids = store.add_extraction_result(chunk, result)

    assert len(node_ids) == 2
    assert store.graph.number_of_nodes() == 2
    assert store.graph.has_edge("concept_quantum_computing", "concept_qubits")


def test_resolved_duplicate_concepts_are_merged_not_left_separate(sample_graph):
    """
    Given entity-resolution output indicating two concepts should merge,
    when the graph update step applies this output,
    the graph should contain one merged node, not two.

    Source: Feature: Graph Update on Ingestion Events — criterion 2
    """
    store = GraphStore(graph=sample_graph)
    node_count_before = store.graph.number_of_nodes()

    store.merge_nodes(keep_id="concept_machine_learning", merge_id="concept_neural_networks")

    assert store.graph.number_of_nodes() == node_count_before - 1
    assert not store.graph.has_node("concept_neural_networks")
    assert store.graph.has_node("concept_machine_learning")


def test_deleting_file_removes_only_nodes_solely_attributable_to_it(sample_graph):
    """
    Given a graph with one concept referenced only by file A and another
    concept shared by files A and B,
    when file A is deleted,
    the concept referenced only by file A should be removed, and the concept
    shared with file B should remain with file A's reference removed from it.

    Source: Feature: Graph Update on Ingestion Events — criterion 3; Issue 7 —
    criteria 2, 3
    """
    store = GraphStore(graph=sample_graph)

    store.remove_file("file_a.md")

    assert not store.graph.has_node("concept_artificial_intelligence")
    assert store.graph.has_node("concept_machine_learning")
    assert "file_a.md" not in store.graph.nodes["concept_machine_learning"]["source_files"]
    assert "file_b.md" in store.graph.nodes["concept_machine_learning"]["source_files"]
