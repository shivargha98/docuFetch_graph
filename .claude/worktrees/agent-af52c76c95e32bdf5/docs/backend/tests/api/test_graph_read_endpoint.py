"""
API/contract tests for the graph-read endpoint: returning the current graph
state (nodes + typed edges) for the frontend graph view.

OPEN QUESTION (Issue 16): the exact response payload shape and pagination
behavior for large graphs are not yet decided. Tests below reference a
placeholder path (marked `# TODO`) and the shape-specific test is skipped
until the contract is finalized.
"""
import pytest

# TODO(Issue 16): replace with the finalized endpoint path once decided.
GRAPH_READ_ENDPOINT = "/graph"  # placeholder


def test_graph_read_returns_all_current_nodes_and_edges(fastapi_test_client, sample_graph):
    """
    Given a backend with an ingested graph,
    when the graph-read endpoint is called,
    the response should include all currently persisted nodes and edges.

    Source: Feature: Graph Read Endpoint — criterion 1; Issue 16 — criterion 1
    """
    raise NotImplementedError


def test_each_returned_edge_includes_relation_type_label(fastapi_test_client, sample_graph):
    """
    Given a graph containing typed edges,
    when the graph-read endpoint is called,
    every edge in the response should include a non-empty relation-type label.

    Source: Feature: Graph Read Endpoint — criterion 2; Issue 16 — criterion 2
    """
    raise NotImplementedError


def test_graph_read_before_ingestion_returns_empty_graph_not_error(fastapi_test_client):
    """
    Given a freshly started backend with no ingestion completed yet,
    when the graph-read endpoint is called,
    the response should be a valid empty-graph payload (200-class response),
    not an error.

    Source: Feature: Graph Read Endpoint — criterion 3; Issue 16 — criterion 3
    """
    raise NotImplementedError


@pytest.mark.skip(
    reason="OPEN QUESTION (Issue 16): exact response shape/pagination for "
    "large graphs undecided. Fill in once settled, then unskip."
)
def test_graph_read_response_shape_matches_finalized_contract(fastapi_test_client):
    """
    Given a finalized graph-read response contract (including pagination
    behavior for large graphs),
    when the endpoint is called,
    the response payload shape should match the finalized contract.

    OPEN QUESTION (Issue 16): placeholder only until the response contract is
    decided.

    Source: Issue 16 — caveat (open question: response shape/pagination)
    """
    raise NotImplementedError
