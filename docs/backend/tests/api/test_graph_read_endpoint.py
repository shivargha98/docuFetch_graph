"""
API/contract tests for the graph-read endpoint: returning the current graph
state (nodes + typed edges) for the frontend graph view.

Response shape finalized in docs/backend/backend_context.md decision #6:
GET /api/graph -> {"nodes": [{"id", "name", "description", "source_files"}],
"edges": [{"source", "target", "relation"}]}. No pagination in v1.
"""
import backend.config as config
from backend.api import config_routes
from backend.graph_store.store import GraphStore

GRAPH_READ_ENDPOINT = "/api/graph"


def _activate_folder(monkeypatch, path="/some/active/folder"):
    """Mark a folder as actively selected: the graph-read endpoint only serves
    graph data while a folder is active (no folder -> empty payload, however
    much stale data is persisted on disk)."""
    monkeypatch.setattr(config_routes, "_current_folder", path)


def test_graph_read_returns_empty_when_no_folder_is_active(fastapi_test_client, sample_graph, tmp_path, monkeypatch):
    """
    Given graph data persisted on disk from an earlier session but NO folder
    actively selected (fresh boot),
    when the graph-read endpoint is called,
    the response must be an empty payload: stale data from a previous
    session must not render as if something were being watched.
    """
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(config, "GRAPH_STORE_PATH", str(graph_path))
    GraphStore(graph=sample_graph).persist(graph_path)
    monkeypatch.setattr(config_routes, "_current_folder", None)

    response = fastapi_test_client.get(GRAPH_READ_ENDPOINT)

    assert response.status_code == 200
    assert response.json() == {"nodes": [], "edges": []}


def test_graph_read_returns_all_current_nodes_and_edges(fastapi_test_client, sample_graph, tmp_path, monkeypatch):
    """
    Given a backend with an ingested graph,
    when the graph-read endpoint is called,
    the response should include all currently persisted nodes and edges.

    Source: Feature: Graph Read Endpoint — criterion 1; Issue 16 — criterion 1
    """
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(config, "GRAPH_STORE_PATH", str(graph_path))
    GraphStore(graph=sample_graph).persist(graph_path)
    _activate_folder(monkeypatch)

    response = fastapi_test_client.get(GRAPH_READ_ENDPOINT)

    assert response.status_code == 200
    body = response.json()
    assert len(body["nodes"]) == sample_graph.number_of_nodes()
    assert len(body["edges"]) == sample_graph.number_of_edges()
    node_ids = {node["id"] for node in body["nodes"]}
    assert node_ids == set(sample_graph.nodes)


def test_each_returned_edge_includes_relation_type_label(fastapi_test_client, sample_graph, tmp_path, monkeypatch):
    """
    Given a graph containing typed edges,
    when the graph-read endpoint is called,
    every edge in the response should include a non-empty relation-type label.

    Source: Feature: Graph Read Endpoint — criterion 2; Issue 16 — criterion 2
    """
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(config, "GRAPH_STORE_PATH", str(graph_path))
    GraphStore(graph=sample_graph).persist(graph_path)
    _activate_folder(monkeypatch)

    response = fastapi_test_client.get(GRAPH_READ_ENDPOINT)

    assert response.status_code == 200
    edges = response.json()["edges"]
    assert len(edges) > 0
    for edge in edges:
        assert edge["relation"]


def test_graph_read_before_ingestion_returns_empty_graph_not_error(fastapi_test_client, tmp_path, monkeypatch):
    """
    Given a freshly started backend with no ingestion completed yet,
    when the graph-read endpoint is called,
    the response should be a valid empty-graph payload (200-class response),
    not an error.

    Source: Feature: Graph Read Endpoint — criterion 3; Issue 16 — criterion 3
    """
    monkeypatch.setattr(config, "GRAPH_STORE_PATH", str(tmp_path / "does_not_exist.json"))

    response = fastapi_test_client.get(GRAPH_READ_ENDPOINT)

    assert response.status_code == 200
    assert response.json() == {"nodes": [], "edges": []}


def test_graph_read_response_shape_matches_finalized_contract(fastapi_test_client, sample_graph, tmp_path, monkeypatch):
    """
    Given a finalized graph-read response contract (including pagination
    behavior for large graphs),
    when the endpoint is called,
    the response payload shape should match the finalized contract.

    Response shape decided in backend_context.md decision #6: no pagination,
    nodes carry id/name/description/source_files, edges carry
    source/target/relation.

    Source: Issue 16 — caveat (open question: response shape/pagination)
    """
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(config, "GRAPH_STORE_PATH", str(graph_path))
    GraphStore(graph=sample_graph).persist(graph_path)
    _activate_folder(monkeypatch)

    response = fastapi_test_client.get(GRAPH_READ_ENDPOINT)

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"nodes", "edges"}
    for node in body["nodes"]:
        assert set(node.keys()) == {"id", "name", "description", "source_files"}
    for edge in body["edges"]:
        assert set(edge.keys()) == {"source", "target", "relation"}
