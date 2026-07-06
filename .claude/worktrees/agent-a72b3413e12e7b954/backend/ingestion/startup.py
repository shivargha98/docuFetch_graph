"""
Backend startup reconciliation (Issue 8): load whatever graph was last
persisted to disk immediately (so it's usable before anything else runs),
then run a background diff-scan over the watched folder to catch any file
changes made while the backend was offline, reusing the same
hash-based/change-detection and deletion-cleanup logic the live folder
watcher uses (Issues 6-7).
"""
import threading
from pathlib import Path

from backend.graph_store.store import GraphStore
from backend.ingestion.hash_store import load_hash_store
from backend.ingestion.watcher import process_file_change, process_file_deletion


def load_persisted_graph(graph_store_path: Path) -> GraphStore:
    """Load the previously-persisted GraphStore from `graph_store_path`, or return a fresh empty one if no prior state exists."""
    if graph_store_path.exists():
        return GraphStore.load(graph_store_path)
    return GraphStore()


def diff_scan(watch_folder: Path, graph_store: GraphStore, vector_store, hash_store_path: Path) -> None:
    """
    Synchronously reconcile `watch_folder` against the persisted hash store:
    for every file currently present, run `process_file_change` (ingests new
    or changed files, no-ops on unchanged ones); for every path recorded in
    the hash store but no longer present on disk, run
    `process_file_deletion`.
    """
    current_files = [path for path in watch_folder.rglob("*") if path.is_file()]
    for path in current_files:
        process_file_change(path, graph_store, vector_store, hash_store_path)

    current_paths = {str(path) for path in current_files}
    hashes = load_hash_store(hash_store_path)
    deleted_paths = [path for path in hashes if path not in current_paths]
    for path_str in deleted_paths:
        process_file_deletion(Path(path_str), graph_store, vector_store, hash_store_path)


def startup(
    watch_folder: Path, graph_store_path: Path, hash_store_path: Path, vector_store
) -> tuple[GraphStore, threading.Thread]:
    """
    Load the persisted graph immediately and return it alongside a
    background thread already running `diff_scan` against it, so callers can
    use the graph right away and separately `.join()` the thread to wait for
    reconciliation to finish deterministically.
    """
    graph_store = load_persisted_graph(graph_store_path)
    thread = threading.Thread(
        target=diff_scan, args=(watch_folder, graph_store, vector_store, hash_store_path), daemon=True
    )
    thread.start()
    return graph_store, thread
