"""
Top-level query orchestrator (Issues 9, 10, 11, 12, 13): wires vector-seeded
lookup -> bounded graph traversal -> no-match detection -> Claude Haiku
answer generation -> chat-session history into a single `answer_query` call.

This module is the architectural anchor later rounds extend without changing
its public interface: Round 5 adds WS traversal streaming (Issue 14) and
folder-config teardown/restart (Issue 15).
"""
from typing import Callable

from backend import chat_session, no_match_detection
from backend.answer_generation.answer import generate_answer
from backend.concurrency.lock import GRAPH_LOCK
from backend.config import NO_MATCH_SIMILARITY_CUTOFF
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
    folder_path: str = "default",
    cutoff: float | None = None,
    on_visit: Callable[[dict], None] | None = None,
) -> dict:
    """
    Orchestrate a full query: look up (or create) the active chat session for
    `folder_path` -> vector-seed -> similarity-cutoff no-match pre-filter ->
    bounded graph traversal -> Haiku relevance double-check -> generate a
    grounded Claude Haiku answer -> record the turn in the session.

    `cutoff` defaults to `backend.config.NO_MATCH_SIMILARITY_CUTOFF` when not
    given. Chat history is no longer passed in externally (as Round 3's own
    docstring anticipated) - it's managed internally via `backend.chat_session`,
    keyed by `folder_path`.

    `on_visit` (Issue 14), when given, is passed straight through to
    `traverse(...)` so a caller (the WS streaming route) can observe each
    traversal step live as it happens. Optional and backward compatible.

    The seeding step and the traversal+context-building step (Issue 17) are
    each wrapped in `GRAPH_LOCK` since they're the only parts of this
    function that actually touch shared graph_store/vector_store state; the
    cutoff check, the Haiku relevance double-check, and generate_answer are
    deliberately left unlocked since they don't touch that state and holding
    the lock across LLM network calls would create unnecessary contention.

    Returns {"answer": <str>, "traversal": <list[dict]>, "seeds": <list[dict]>,
    "no_match": <bool>}. When `no_match` is True, `answer` is
    `no_match_detection.NOT_FOUND_MESSAGE` instead of a generated answer.
    """
    session = chat_session.get_or_create_session(folder_path)
    history = chat_session.get_history(session)

    with GRAPH_LOCK:
        seeds = seed_from_query(query, vector_store)
    effective_cutoff = cutoff if cutoff is not None else NO_MATCH_SIMILARITY_CUTOFF

    if not no_match_detection.passes_cutoff(seeds, effective_cutoff):
        answer = no_match_detection.NOT_FOUND_MESSAGE
        chat_session.add_turn(session, query, answer)
        return {"answer": answer, "traversal": [], "seeds": seeds, "no_match": True}

    seed_node_ids = [seed["node_id"] for seed in seeds]
    with GRAPH_LOCK:
        traversal = traverse(graph_store, seed_node_ids, query, on_visit=on_visit)
        context = _build_context(graph_store, traversal)

    if not no_match_detection.check_relevance(context, query):
        answer = no_match_detection.NOT_FOUND_MESSAGE
        chat_session.add_turn(session, query, answer)
        return {"answer": answer, "traversal": traversal, "seeds": seeds, "no_match": True}

    answer = generate_answer(context, query, history)
    chat_session.add_turn(session, query, answer)
    return {"answer": answer, "traversal": traversal, "seeds": seeds, "no_match": False}
