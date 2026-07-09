"""
Graph read API route. Exposes GET /api/graph, which loads the current concept
graph fresh from disk on every request and returns its nodes and edges in the
finalized response shape (see docs/backend/backend_context.md decision #6).
"""
from pathlib import Path

from fastapi import APIRouter

import backend.config as config
from backend.api import config_routes
from backend.graph_store.store import GraphStore

router = APIRouter()


@router.get("/api/graph")
def get_graph() -> dict:
    """
    Load the graph currently persisted at config.GRAPH_STORE_PATH and return
    it as {"nodes": [...], "edges": [...]}. Returns an empty payload when no
    graph has been persisted yet (no ingestion has run) — or when no folder
    is actively selected: graph data on disk belongs to a previous session's
    folder, and must not render as if something were being watched.
    """
    if config_routes.get_active_folder() is None:
        return {"nodes": [], "edges": []}
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
