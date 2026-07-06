"""
Folder configuration API route (Issue 15). Exposes GET/POST /api/folder-config,
letting the UI read the currently-watched folder and switch to a new one. A
folder switch tears down the previous FolderWatcher, starts a fresh
GraphStore/VectorStore scoped to the new folder, reuses Round 4's
startup.startup()/FolderWatcher machinery to (re)ingest and watch it, and
resets the chat session so no history carries over from the old folder.
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import config
from backend.chat_session import session as chat_session
from backend.graph_store.store import GraphStore
from backend.ingestion import startup
from backend.ingestion.watcher import FolderWatcher
from backend.vector_store.store import VectorStore

router = APIRouter()

_current_folder: str = config.WATCH_FOLDER
_current_watcher: FolderWatcher | None = None


class FolderConfigRequest(BaseModel):
    """Request body for POST /api/folder-config: the new absolute folder path to switch to."""

    path: str


@router.get("/api/folder-config")
def get_folder_config() -> dict:
    """Return the currently active watched folder as {"path": <folder>}."""
    return {"path": _current_folder}


@router.post("/api/folder-config")
def set_folder_config(payload: FolderConfigRequest) -> dict:
    """
    Switch the actively-watched folder to `payload.path`.

    Validates the new path exists and is a directory (422 with a reason
    otherwise), stops the previous FolderWatcher if one is running, starts a
    fresh GraphStore/VectorStore scoped to the new folder, re-ingests it via
    startup.startup() (immediate load + background diff-scan reconciliation),
    starts a new FolderWatcher for it, resets the chat session, and updates
    the module-level current-folder state.
    """
    global _current_folder, _current_watcher

    new_path = Path(payload.path)
    if not new_path.exists():
        raise HTTPException(status_code=422, detail="Path does not exist")
    if not new_path.is_dir():
        raise HTTPException(status_code=422, detail="Path is not a directory")

    if _current_watcher is not None:
        _current_watcher.stop()

    graph_store_path = Path(config.GRAPH_STORE_PATH)
    hash_store_path = Path(config.HASH_STORE_PATH)

    # Start from a clean slate for the new folder: persist a fresh, empty
    # GraphStore over whatever was on disk for the previous folder, so
    # startup()'s load_persisted_graph() picks up this empty graph rather
    # than the old folder's data.
    GraphStore().persist(graph_store_path)
    vector_store = VectorStore()

    graph_store, _thread = startup.startup(new_path, graph_store_path, hash_store_path, vector_store)

    watcher = FolderWatcher(new_path, graph_store, vector_store, hash_store_path)
    watcher.start()
    _current_watcher = watcher

    chat_session.start_new_session(str(new_path))

    _current_folder = str(new_path)
    return {"path": _current_folder, "status": "watching"}
