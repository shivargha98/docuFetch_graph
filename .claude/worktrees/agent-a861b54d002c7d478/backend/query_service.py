"""
Top-level query orchestrator (Issues 9, 10, 11): wires vector-seeded lookup
-> bounded graph traversal -> Claude Haiku answer generation into a single
`answer_query` call.

This module is the architectural anchor later rounds extend without changing
its public interface: Round 4 adds no-match short-circuiting (Issue 12) and
real chat-session history management (Issue 13); Round 5 adds WS traversal
streaming (Issue 14) and folder-config teardown/restart (Issue 15). `history`
is accepted here purely as a passthrough parameter — this module does not
manage its lifecycle.
"""
from backend.answer_generation.answer import generate_answer
from backend.graph_store.store import GraphStore
from backend.retrieval.seed import seed_from_query
from backend.retrieval.traversal import traverse
from backend.vector_store.store import VectorStore


def _build_context(graph_store: GraphStore, traversal: list[dict]) -> str:
    """
    Concatenate each visited traversal step's concept name, graph
    description, and the relation label that led to it into a single
    newline-separated context string, in visitation order, for the answer
    call.
    """
    graph = graph_store.graph
    lines = []
    for step in traversal:
        description = graph.nodes[step["node_id"]].get("description", "")
        relation_part = f" (via {step['via_relation']})" if step["via_relation"] else ""
        lines.append(f"{step['concept']}{relation_part}: {description}")
    return "\n".join(lines)


def answer_query(
    query: str,
    graph_store: GraphStore,
    vector_store: VectorStore,
    history: list[dict] | None = None,
) -> dict:
    """
    Orchestrate a full query: vector-seed -> bounded graph traversal ->
    build a context string from the traversed nodes -> generate a grounded
    Claude Haiku answer.

    Returns {"answer": <str>, "traversal": <list[dict] from traverse()>,
    "seeds": <list[dict] from seed_from_query()>}.

    Deliberately does NOT implement no-match detection (Issue 12) or real
    chat-session history management (Issue 13) — those are Round 4's job and
    will extend this exact function. If `seed_from_query` returns no seeds,
    traversal still runs (trivially returning an empty list) and a
    best-effort empty-context answer is produced rather than crashing or
    short-circuiting; Round 4 will replace this with the real
    cutoff-based short-circuit.
    """
    seeds = seed_from_query(query, vector_store)
    seed_node_ids = [seed["node_id"] for seed in seeds]
    traversal = traverse(graph_store, seed_node_ids, query)
    context = _build_context(graph_store, traversal)
    answer = generate_answer(context, query, history)
    return {"answer": answer, "traversal": traversal, "seeds": seeds}
