"""
Unit tests for the retrieval module: vector-seeded concept lookup and
LLM-guided bounded graph traversal (max 3 hops / 15 nodes).
"""
import networkx as nx
import pytest

from backend.graph_store.store import GraphStore
from backend.ingestion.chunking import Chunk
from backend.retrieval.seed import seed_from_query
from backend.retrieval.traversal import traverse


def _build_chain_graph(n: int) -> GraphStore:
    """Build a GraphStore wrapping a straight-line chain of n nodes: node_0 -[next]-> node_1 -> ... -> node_{n-1}."""
    graph = nx.MultiDiGraph()
    for i in range(n):
        node_id = f"node_{i}"
        graph.add_node(node_id, id=node_id, name=f"Node {i}", description=f"Description {i}", source_files=["f.md"])
    for i in range(n - 1):
        graph.add_edge(f"node_{i}", f"node_{i + 1}", relation="next")
    return GraphStore(graph=graph)


def _always_continue_to_only_neighbor(current_node, neighbors, query):
    """Fake traversal-reasoning decision that always follows the (sole) first neighbor offered."""
    chosen = neighbors[0]
    return {"next_node_id": chosen["node_id"], "relation": chosen["relation"]}


def test_query_returns_ranked_top_k_seed_list(chroma_test_client, mock_embedding_client):
    """
    Given a populated Chroma collection and a query string,
    when the query is embedded and matched,
    a ranked top-k list of candidate chunks/concepts should be returned.

    Source: Feature: Vector-Seeded Concept Lookup — criterion 1; Issue 9 — criterion 1
    """
    mock_embedding_client.set_response([1.0, 0.0, 0.0])
    chroma_test_client.add_chunk(
        Chunk(chunk_id="c-ml", text="Machine learning text.", source_file="file_a.md", section="ML"),
        ["concept_machine_learning"],
    )
    mock_embedding_client.set_response([0.0, 1.0, 0.0])
    chroma_test_client.add_chunk(
        Chunk(chunk_id="c-ai", text="Artificial intelligence text.", source_file="file_a.md", section="AI"),
        ["concept_artificial_intelligence"],
    )

    mock_embedding_client.set_response([0.9, 0.1, 0.0])
    seeds = seed_from_query("query about ML", chroma_test_client, top_k=2)

    assert len(seeds) == 2
    assert seeds[0]["node_id"] == "concept_machine_learning"


def test_seed_results_include_concept_id_reference(chroma_test_client, mock_embedding_client):
    """
    Given seed results from a vector-search match,
    when the results are inspected,
    each seed result should include a concept/graph node id usable to start
    traversal.

    Source: Feature: Vector-Seeded Concept Lookup — criterion 2; Issue 9 — criterion 2
    """
    mock_embedding_client.set_response([1.0, 0.0, 0.0])
    chroma_test_client.add_chunk(
        Chunk(chunk_id="c-ml", text="Machine learning text.", source_file="file_a.md", section="ML"),
        ["concept_machine_learning"],
    )

    mock_embedding_client.set_response([0.9, 0.1, 0.0])
    seeds = seed_from_query("query", chroma_test_client)

    assert len(seeds) == 1
    assert seeds[0]["node_id"] == "concept_machine_learning"
    assert "score" in seeds[0]


def test_empty_graph_query_returns_empty_seed_set_without_erroring(chroma_test_client, mock_embedding_client):
    """
    Given a Chroma collection with no or very few ingested chunks,
    when a query is run,
    an empty seed list should be returned and no exception should be raised.

    Source: Feature: Vector-Seeded Concept Lookup — criterion 3; Issue 9 — criterion 3
    """
    mock_embedding_client.set_response([0.5, 0.5, 0.0])

    seeds = seed_from_query("anything", chroma_test_client)

    assert seeds == []


def test_traversal_starts_only_from_seed_nodes(sample_graph, mock_traversal_llm):
    """
    Given a graph and a set of vector-search seed nodes,
    when traversal runs,
    the first visited node(s) should be drawn only from the seed set, not an
    arbitrary graph entry point.

    Source: Feature: LLM-Guided Bounded Graph Traversal — criterion 1; Issue 10 — criterion 1
    """
    graph_store = GraphStore(graph=sample_graph)
    mock_traversal_llm.set_response({"next_node_id": None, "relation": None})

    result = traverse(graph_store, ["concept_artificial_intelligence"], "query")

    assert result[0]["node_id"] == "concept_artificial_intelligence"
    assert result[0]["hop"] == 0
    assert all(step["node_id"] == "concept_artificial_intelligence" for step in result)


def test_traversal_never_exceeds_three_hops(sample_graph, mock_traversal_llm):
    """
    Given a densely connected graph and a mocked traversal-reasoning LLM that
    always chooses to continue,
    when traversal runs,
    no visited node should be more than 3 hops from its seed.

    Uses a locally-built 10-node linear chain (not the shared 3-node
    sample_graph fixture) so the graph is deep enough to actually stress the
    hop cap: with max_nodes generously large (100) but max_hops left at its
    default of 3, only nodes 0-3 (4 nodes) should ever be visited even though
    the mocked LLM always continues down the chain.

    Source: Feature: LLM-Guided Bounded Graph Traversal — criterion 2; Issue 10 — criterion 2
    """
    graph_store = _build_chain_graph(10)
    mock_traversal_llm.set_response(_always_continue_to_only_neighbor)

    result = traverse(graph_store, ["node_0"], "query", max_hops=3, max_nodes=100)

    assert max(step["hop"] for step in result) == 3
    assert len(result) == 4
    assert [step["node_id"] for step in result] == ["node_0", "node_1", "node_2", "node_3"]


def test_traversal_never_visits_more_than_fifteen_nodes(sample_graph, mock_traversal_llm):
    """
    Given a densely connected graph with more than 15 reachable nodes within 3
    hops, and a mocked traversal-reasoning LLM that always continues,
    when traversal runs,
    the total visited node count should be capped at 15.

    Uses a locally-built 25-node linear chain with max_hops deliberately
    raised (20) so the hop cap can't be what stops traversal first — only the
    max_nodes cap (left at its default of 15) can be responsible for
    stopping it.

    Source: Feature: LLM-Guided Bounded Graph Traversal — criterion 3; Issue 10 — criterion 3
    """
    graph_store = _build_chain_graph(25)
    mock_traversal_llm.set_response(_always_continue_to_only_neighbor)

    result = traverse(graph_store, ["node_0"], "query", max_hops=20, max_nodes=15)

    assert len(result) == 15


def test_each_hop_choice_is_driven_by_llm_call_over_neighbors(sample_graph, mock_traversal_llm):
    """
    Given a node with multiple outgoing edges and a mocked traversal-reasoning
    LLM,
    when traversal decides its next hop,
    the traversal-reasoning LLM should be invoked with the current node's
    neighbor edges, and the next node visited should match the mocked LLM's
    chosen edge (not a fixed/blind rule like plain BFS order).

    concept_machine_learning has one outgoing neighbor
    (concept_artificial_intelligence) and one incoming neighbor
    (concept_neural_networks); the mock is configured to choose the incoming
    one specifically, proving the choice is LLM-driven rather than a blind
    "first neighbor" rule (out-edges are gathered before in-edges).

    Source: Feature: LLM-Guided Bounded Graph Traversal — criterion 4; Issue 10 — criterion 4
    """
    graph_store = GraphStore(graph=sample_graph)
    mock_traversal_llm.set_response({"next_node_id": "concept_neural_networks", "relation": "part_of"})

    result = traverse(graph_store, ["concept_machine_learning"], "query")

    assert len(mock_traversal_llm.calls) == 1
    current_node, neighbors, query = mock_traversal_llm.calls[0]
    assert current_node["node_id"] == "concept_machine_learning"
    neighbor_ids = {neighbor["node_id"] for neighbor in neighbors}
    assert neighbor_ids == {"concept_artificial_intelligence", "concept_neural_networks"}
    assert query == "query"

    assert result[1]["node_id"] == "concept_neural_networks"


def test_traversal_output_is_ordered_streamable_step_sequence(sample_graph, mock_traversal_llm):
    """
    Given a completed traversal run,
    when the result is inspected,
    the result should be an ordered list of (node, edge, hop-number) steps in
    visitation order.

    Source: Feature: LLM-Guided Bounded Graph Traversal — criterion 5; Issue 10 — criterion 5
    """
    graph_store = GraphStore(graph=sample_graph)
    mock_traversal_llm.set_side_effect_sequence(
        [
            {"next_node_id": "concept_machine_learning", "relation": "part_of"},
            {"next_node_id": "concept_artificial_intelligence", "relation": "part_of"},
        ]
    )

    result = traverse(graph_store, ["concept_neural_networks"], "query")

    assert result == [
        {"node_id": "concept_neural_networks", "concept": "Neural Networks", "hop": 0, "via_relation": None},
        {"node_id": "concept_machine_learning", "concept": "Machine Learning", "hop": 1, "via_relation": "part_of"},
        {
            "node_id": "concept_artificial_intelligence",
            "concept": "Artificial Intelligence",
            "hop": 2,
            "via_relation": "part_of",
        },
    ]
