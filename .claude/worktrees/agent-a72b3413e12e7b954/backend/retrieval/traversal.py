"""
LLM-guided bounded graph traversal (Issue 10). Starting from Issue 9's seed
concepts, iteratively asks the traversal-reasoning LLM
(`openrouter_client.traversal_next_hop`) which single neighboring edge (if
any) is worth following next, per currently-visited-branch, bounded to a
maximum of 3 hops and 15 total visited nodes (whichever limit triggers
first).
"""
from typing import Callable

from backend.clients import openrouter_client
from backend.graph_store.store import GraphStore


def _neighbor_candidates(graph_store: GraphStore, node_id: str, visited_ids: set[str]) -> list[dict]:
    """
    Gather `node_id`'s neighbor edges, both outgoing and incoming (a
    concept's relevant context can come from either direction), excluding any
    neighbor already in `visited_ids`.

    Returns a list of {"node_id", "name", "relation", "direction"} dicts,
    where `direction` is "outgoing" or "incoming" relative to `node_id`.
    """
    graph = graph_store.graph
    neighbors: list[dict] = []
    for _, target, edge_data in graph.out_edges(node_id, data=True):
        if target in visited_ids:
            continue
        neighbors.append(
            {
                "node_id": target,
                "name": graph.nodes[target].get("name", target),
                "relation": edge_data.get("relation"),
                "direction": "outgoing",
            }
        )
    for source, _, edge_data in graph.in_edges(node_id, data=True):
        if source in visited_ids:
            continue
        neighbors.append(
            {
                "node_id": source,
                "name": graph.nodes[source].get("name", source),
                "relation": edge_data.get("relation"),
                "direction": "incoming",
            }
        )
    return neighbors


def traverse(
    graph_store: GraphStore,
    seed_node_ids: list[str],
    query: str,
    max_hops: int = 3,
    max_nodes: int = 15,
    on_visit: Callable[[dict], None] | None = None,
) -> list[dict]:
    """
    Traverse `graph_store` starting from `seed_node_ids` (hop 0), asking
    `openrouter_client.traversal_next_hop` at each subsequent hop which
    single neighbor (if any) is worth following next for each
    still-active branch from the previous hop.

    Bounded by `max_hops` (no branch is expanded past this many hops from its
    seed) and `max_nodes` (the entire traversal stops the instant total
    visited nodes reaches this count), whichever limit triggers first.

    `on_visit` (Issue 14), when given, is called with each step's dict right
    after it's appended to `steps`, so a caller can observe/stream each
    visited node live as traversal happens rather than only getting the final
    list back. Optional and backward compatible - existing callers that don't
    pass it see no change in behavior or return value.

    Returns an ordered list of steps in visitation order:
    {"node_id", "concept" (the node's name), "hop", "via_relation" (the
    relation label that led to this node, or None for seed/hop-0 nodes)}.
    """
    graph = graph_store.graph
    visited_ids: set[str] = set()
    steps: list[dict] = []

    def _visit(node_id: str, hop: int, via_relation: str | None) -> bool:
        """Record `node_id` as visited at `hop` if it hasn't been visited, exists in the graph, and there's room under max_nodes. Returns whether it was visited."""
        if node_id in visited_ids or len(steps) >= max_nodes or not graph.has_node(node_id):
            return False
        visited_ids.add(node_id)
        steps.append(
            {
                "node_id": node_id,
                "concept": graph.nodes[node_id].get("name", node_id),
                "hop": hop,
                "via_relation": via_relation,
            }
        )
        if on_visit is not None:
            on_visit(steps[-1])
        return True

    frontier: list[str] = []
    for seed_id in seed_node_ids:
        if len(steps) >= max_nodes:
            break
        if _visit(seed_id, hop=0, via_relation=None):
            frontier.append(seed_id)

    hop = 0
    while frontier and hop < max_hops and len(steps) < max_nodes:
        hop += 1
        next_frontier: list[str] = []
        for node_id in frontier:
            if len(steps) >= max_nodes:
                break
            neighbors = _neighbor_candidates(graph_store, node_id, visited_ids)
            if not neighbors:
                continue
            current_node = {
                "node_id": node_id,
                "name": graph.nodes[node_id].get("name", node_id),
                "description": graph.nodes[node_id].get("description", ""),
            }
            decision = openrouter_client.traversal_next_hop(current_node, neighbors, query)
            next_node_id = decision.get("next_node_id")
            relation = decision.get("relation")
            if not next_node_id:
                continue
            if _visit(next_node_id, hop=hop, via_relation=relation):
                next_frontier.append(next_node_id)
        frontier = next_frontier

    return steps
