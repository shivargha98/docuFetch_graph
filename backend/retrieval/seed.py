"""
Vector-seeded concept lookup (Issue 9). Turns a raw chat query string into a
list of graph-node seed points for traversal by embedding the query and
matching it against the Chroma vector store, then expanding each matched
chunk into one seed per graph node id it references.
"""
import logging

from backend.vector_store.store import VectorStore

logger = logging.getLogger(__name__)


def seed_from_query(query: str, vector_store: VectorStore, top_k: int = 5) -> list[dict]:
    """
    Embed `query` and match it against `vector_store` to produce seed nodes
    for graph traversal.

    `vector_store.query()` returns one match per chunk, each carrying a
    `graph_node_ids` list (a chunk can map to multiple concepts). Since
    traversal operates on graph nodes rather than chunks, each match is
    expanded here into one seed dict per node id it references:
    `{"node_id": ..., "score": ...}`. If the same node id is referenced by
    more than one matched chunk, only the best (lowest-distance) score is
    kept, and the seed's position in the returned list reflects the first
    (best-ranked) chunk it was seen in.

    Any exception raised while querying the vector store (e.g. Chroma
    behaving inconsistently on an empty/uninitialized collection) is caught
    here and results in an empty seed list, rather than propagating an error
    up to the caller — per Issue 9's acceptance criterion that a sparse/empty
    graph must not error out.
    """
    try:
        matches = vector_store.query(query, top_k)
    except Exception:
        logger.exception("Vector store query failed for query %r; returning no seeds", query)
        return []

    best_score_by_node: dict[str, float] = {}
    for match in matches:
        score = match["score"]
        for node_id in match["graph_node_ids"]:
            if node_id not in best_score_by_node or score < best_score_by_node[node_id]:
                best_score_by_node[node_id] = score

    return [{"node_id": node_id, "score": score} for node_id, score in best_score_by_node.items()]
