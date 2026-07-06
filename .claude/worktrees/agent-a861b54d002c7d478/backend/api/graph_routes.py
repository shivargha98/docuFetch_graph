"""
Graph read API route. Exposes GET /api/graph, which loads the current concept
graph fresh from disk on every request and returns its nodes and edges in the
finalized response shape (see docs/backend/backend_context.md decision #6).
"""
from pathlib import Path

from fastapi import APIRouter

import backend.config as config
from backend.graph_store.store import GraphStore

router = APIRouter()


@router.get("/api/graph")
def get_graph() -> dict:
    """
    Load the graph currently persisted at config.GRAPH_STORE_PATH and return
    it as {"nodes": [...], "edges": [...]}. If no graph has been persisted
    yet (no ingestion has run), return an empty graph payload instead of
    raising an error.
    """
    try:
        store = GraphStore.load(Path(config.GRAPH_STORE_PATH))
    except FileNotFoundError:
        return {"nodes": [], "edges": []}

    nodes = [
        {
            "id": node_id,
            "name": data["name"],
            "description": data["description"],
            "source_files": data["source_files"],
        }
        for node_id, data in store.graph.nodes(data=True)
    ]
    edges = [
        {"source": u, "target": v, "relation": data["relation"]}
        for u, v, data in store.graph.edges(data=True)
    ]
    return {"nodes": nodes, "edges": edges}
