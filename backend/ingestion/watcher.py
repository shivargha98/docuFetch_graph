"""
Filesystem watcher for the ingestion pipeline (Issues 6 + 7). Watches a
folder for file create/modify/delete events using `watchdog`, debounces
rapid successive create/modify events for the same path so a burst of
autosaves collapses into a single ingestion pass, and routes changes through
hash-based incremental re-ingestion (`process_file_change`) or cleanup
(`process_file_deletion`).
"""
import threading
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from backend.concurrency.lock import GRAPH_LOCK
from backend.config import GRAPH_STORE_PATH
from backend.entity_resolution import resolver
from backend.ingestion import pipeline
from backend.ingestion.hash_store import compute_file_hash, load_hash_store, save_hash_store


def process_file_change(path: Path, graph_store, vector_store, hash_store_path: Path) -> bool:
    """
    Hash `path` and compare against the persisted hash store.

    If the hash is unchanged, skip re-extraction and return False. If the
    file is new or its content changed, run the ingestion pipeline on it,
    re-run cross-file entity resolution over the whole graph, update the
    hash store with the new hash, and return True.

    The pipeline/resolution/hash-store-update section that mutates shared
    graph_store/vector_store state is wrapped in GRAPH_LOCK (Issue 17) so a
    concurrent query read never observes a partially-updated graph.
    """
    current_hash = compute_file_hash(path)
    hashes = load_hash_store(hash_store_path)
    key = str(path)

    if hashes.get(key) == current_hash:
        return False

    with GRAPH_LOCK:
        pipeline.ingest_file(path, graph_store, vector_store=vector_store)
        resolver.resolve_all(graph_store)

        hashes[key] = current_hash
        save_hash_store(hashes, hash_store_path)
    return True


def process_file_deletion(path: Path, graph_store, vector_store, hash_store_path: Path) -> None:
    """
    Clean up everything attributable to a deleted file: remove its graph
    nodes/edges that aren't shared with other files (via
    `graph_store.remove_file`), remove its Chroma embeddings (via
    `vector_store.delete_file`), drop its entry from the hash store, and
    persist the updated graph to `GRAPH_STORE_PATH`.

    `vector_store` may be None (mirroring `pipeline.ingest_file`'s own
    optional vector_store), in which case the Chroma cleanup step is
    skipped.

    The mutation section is wrapped in GRAPH_LOCK (Issue 17), matching
    process_file_change, so deletion is also guarded against concurrent
    query reads.
    """
    key = str(path)
    with GRAPH_LOCK:
        graph_store.remove_file(key)
        if vector_store is not None:
            vector_store.delete_file(key)

        hashes = load_hash_store(hash_store_path)
        hashes.pop(key, None)
        save_hash_store(hashes, hash_store_path)

        graph_store.persist(Path(GRAPH_STORE_PATH))


class _WatchHandler(FileSystemEventHandler):
    """watchdog event handler that debounces create/modify events per path through the owning FolderWatcher and processes deletes immediately."""

    def __init__(self, watcher: "FolderWatcher"):
        """Keep a reference back to the owning FolderWatcher so events can reach its debounce timers and store references."""
        self._watcher = watcher

    def on_created(self, event) -> None:
        """Debounce a file-creation event through the owning watcher (ignores directory events)."""
        if not event.is_directory:
            self._watcher._debounce(Path(event.src_path))

    def on_modified(self, event) -> None:
        """Debounce a file-modification event through the owning watcher (ignores directory events)."""
        if not event.is_directory:
            self._watcher._debounce(Path(event.src_path))

    def on_deleted(self, event) -> None:
        """Process a file-deletion event immediately, with no debounce (ignores directory events)."""
        if not event.is_directory:
            self._watcher._handle_deletion(Path(event.src_path))


class FolderWatcher:
    """
    Watches `watch_folder` for file create/modify/delete events using
    watchdog, debouncing rapid successive create/modify events for the same
    path into a single `process_file_change` call, and routing delete events
    straight to `process_file_deletion`.
    """

    def __init__(
        self,
        watch_folder: Path,
        graph_store,
        vector_store,
        hash_store_path: Path,
        debounce_seconds: float = 0.5,
    ):
        """
        Store the watch target and dependencies, and prepare (but don't yet
        start) the underlying watchdog Observer, recursively watching
        `watch_folder`. `debounce_seconds` controls how long a path must be
        quiet before its debounced create/modify event actually fires.
        """
        self.watch_folder = watch_folder
        self.graph_store = graph_store
        self.vector_store = vector_store
        self.hash_store_path = hash_store_path
        self.debounce_seconds = debounce_seconds

        self._timers: dict[str, threading.Timer] = {}
        self._observer = Observer()
        self._observer.schedule(_WatchHandler(self), str(watch_folder), recursive=True)

    def _debounce(self, path: Path) -> None:
        """
        (Re)start a `debounce_seconds` timer for `path`, cancelling any timer
        already pending for it, so a burst of create/modify events for the
        same path collapses into exactly one `process_file_change` call once
        the path goes quiet.
        """
        key = str(path)
        existing = self._timers.get(key)
        if existing is not None:
            existing.cancel()

        timer = threading.Timer(self.debounce_seconds, self._run_process_file_change, args=(path,))
        self._timers[key] = timer
        timer.start()

    def _run_process_file_change(self, path: Path) -> None:
        """Run process_file_change for `path` once its debounce timer fires."""
        process_file_change(path, self.graph_store, self.vector_store, self.hash_store_path)

    def _handle_deletion(self, path: Path) -> None:
        """Cancel any pending debounce timer for `path` (a deleted file can't still be mid-save), then run process_file_deletion."""
        existing = self._timers.pop(str(path), None)
        if existing is not None:
            existing.cancel()
        process_file_deletion(path, self.graph_store, self.vector_store, self.hash_store_path)

    def start(self) -> None:
        """Start the underlying watchdog Observer thread."""
        self._observer.start()

    def stop(self) -> None:
        """Stop the underlying watchdog Observer thread and wait for it to fully shut down."""
        self._observer.stop()
        self._observer.join()
