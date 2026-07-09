"""
Folder configuration API route (Issue 15). Exposes GET/POST /api/folder-config,
letting the UI read the currently-watched folder and switch to a new one. A
folder switch tears down the previous FolderWatcher, purges the previous
folder's graph and vector-store data and starts fresh for the new folder,
reuses Round 4's startup.startup()/FolderWatcher machinery to (re)ingest and
watch it, and resets the chat session so no history carries over from the
old folder.
"""
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import config
from backend.chat_session import session as chat_session
from backend.graph_store.store import GraphStore
from backend.ingestion import startup
from backend.ingestion.hash_store import save_hash_store
from backend.ingestion.watcher import FolderWatcher
from backend.vector_store.store import VectorStore

router = APIRouter()

# No folder is active until the user explicitly selects one (browse/upload):
# the app must not claim to watch anything at boot — previously this
# defaulted to WATCH_FOLDER, so the UI showed "Watching <folder>" for a
# folder no watcher was actually running against.
_current_folder: str | None = None
_current_watcher: FolderWatcher | None = None
_current_ingest_thread: threading.Thread | None = None


def get_active_folder() -> str | None:
    """The currently selected folder path, or None when nothing is active (fresh boot, nothing chosen yet)."""
    return _current_folder


class FolderConfigRequest(BaseModel):
    """Request body for POST /api/folder-config: the new absolute folder path to switch to."""

    path: str


def switch_to_folder(new_path: Path) -> None:
    """
    Core folder-switch logic shared by POST /api/folder-config and
    POST /api/ingest/upload: stop the previous watcher, purge the previous
    folder's graph and vector-store data, re-ingest the new folder via
    startup.startup() (recording its reconciliation thread for
    /api/ingest-status), start a fresh watcher, and reset the chat session.
    """
    global _current_folder, _current_watcher, _current_ingest_thread

    if _current_watcher is not None:
        _current_watcher.stop()

    graph_store_path = Path(config.GRAPH_STORE_PATH)
    hash_store_path = Path(config.HASH_STORE_PATH)

    GraphStore().persist(graph_store_path)
    vector_store = VectorStore()
    vector_store.clear_all()
    # The hash store must be purged together with the graph/vector stores:
    # the startup diff-scan skips any file whose hash matches, so stale
    # entries from a previous ingestion of the same content (re-upload of a
    # copy, switching back to a folder) would leave the freshly-wiped graph
    # permanently empty and end the reconciliation thread instantly.
    save_hash_store({}, hash_store_path)

    graph_store, thread = startup.startup(new_path, graph_store_path, hash_store_path, vector_store)
    _current_ingest_thread = thread

    watcher = FolderWatcher(new_path, graph_store, vector_store, hash_store_path)
    watcher.start()
    _current_watcher = watcher

    chat_session.start_new_session(str(new_path))
    _current_folder = str(new_path)


@router.get("/api/folder-config")
def get_folder_config() -> dict:
    """Return the currently active watched folder as {"path": <folder>}."""
    return {"path": _current_folder}


@router.get("/api/ingest-status")
def get_ingest_status() -> dict:
    """Report whether a folder switch's ingestion/reconciliation thread is still running."""
    ingesting = _current_ingest_thread is not None and _current_ingest_thread.is_alive()
    return {"ingesting": ingesting, "path": _current_folder}


@router.post("/api/folder-config")
def set_folder_config(payload: FolderConfigRequest) -> dict:
    """
    Switch the actively-watched folder to `payload.path`.

    Validates the new path exists and is a directory (422 with a reason
    otherwise), then delegates to switch_to_folder() for the core folder-switch
    logic.
    """
    new_path = Path(payload.path)
    if not new_path.exists():
        raise HTTPException(status_code=422, detail="Path does not exist")
    if not new_path.is_dir():
        raise HTTPException(status_code=422, detail="Path is not a directory")

    switch_to_folder(new_path)
    return {"path": _current_folder, "status": "watching"}
