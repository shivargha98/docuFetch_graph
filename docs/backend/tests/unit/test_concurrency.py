"""
Unit tests for the concurrency-guarding lock behavior: a plain threading.Lock
(GRAPH_LOCK) wrapping graph_store + vector_store access. See
backend_context.md for the reasoning behind choosing threading.Lock over
asyncio.Lock (our watcher/query_service entry points always run on real OS
threads, never natively inside asyncio's event loop).
"""
import threading
from unittest.mock import MagicMock

from backend.concurrency.lock import GRAPH_LOCK
from backend.graph_store.store import GraphStore
from backend.ingestion.watcher import process_file_change, process_file_deletion
from backend.query_service import answer_query


def _make_vector_store_stub():
    """Build a minimal stand-in for VectorStore with a no-op query, sufficient for lock tests that don't care about embedding content."""
    stub = MagicMock()
    stub.query.return_value = []
    return stub


def test_extraction_runs_unlocked_and_mutations_run_locked(tmp_path, monkeypatch):
    """
    Given the fine-grained locking model (2026-07-10): the slow per-chunk
    LLM extraction must run WITHOUT GRAPH_LOCK (so concurrent queries aren't
    starved for the file's whole duration), while each graph mutation and
    the final persist must hold it.

    Exercised at the pipeline level, where the lock now lives. Deletion
    cleanup (fast, no LLM) still holds the lock for its whole operation.
    """
    from backend.ingestion import pipeline
    from backend.ingestion.chunking import Chunk

    sample_file = tmp_path / "sample.txt"
    sample_file.write_text("hello world", encoding="utf-8")

    observed = {}

    monkeypatch.setattr(
        "backend.ingestion.pipeline.load_file", lambda path: "doc"
    )
    monkeypatch.setattr(
        "backend.ingestion.pipeline.chunk_document",
        lambda document: [Chunk(chunk_id="c1", text="hello", source_file=str(sample_file), section=None)],
    )

    def fake_extract(chunk):
        observed["locked_during_extraction"] = GRAPH_LOCK.locked()
        return {"concepts": [], "relations": []}

    monkeypatch.setattr("backend.ingestion.pipeline.extract_from_chunk", fake_extract)

    graph_store = GraphStore()

    def fake_add(chunk, result):
        observed["locked_during_mutation"] = GRAPH_LOCK.locked()
        return []

    monkeypatch.setattr(graph_store, "add_extraction_result", fake_add)
    monkeypatch.setattr(
        graph_store, "persist", lambda path: observed.__setitem__("locked_during_persist", GRAPH_LOCK.locked())
    )

    assert not GRAPH_LOCK.locked()
    pipeline.ingest_file(sample_file, graph_store)
    assert observed["locked_during_extraction"] is False
    assert observed["locked_during_mutation"] is True
    assert observed["locked_during_persist"] is True
    assert not GRAPH_LOCK.locked()

    # Deletion cleanup still holds the lock for its whole (fast) operation.
    vector_store = _make_vector_store_stub()
    hash_store_path = tmp_path / "hashes.json"
    deletion_observed = {}

    def fake_remove_file(source_file):
        deletion_observed["locked_during_delete"] = GRAPH_LOCK.locked()

    monkeypatch.setattr(graph_store, "remove_file", fake_remove_file)
    monkeypatch.setattr(graph_store, "persist", lambda path: None)

    process_file_deletion(sample_file, graph_store, vector_store, hash_store_path)
    assert deletion_observed["locked_during_delete"] is True
    assert not GRAPH_LOCK.locked()


def test_query_read_acquires_the_same_lock_briefly(monkeypatch):
    """
    Given a query read operation (answer_query) against graph_store/vector_store,
    when the read executes,
    the same GRAPH_LOCK should be acquired for the seeding/traversal steps and
    released promptly after each.

    Source: Issue 17 — criterion 1
    """
    graph_store = GraphStore()
    vector_store = _make_vector_store_stub()

    observed_locked_state = {}

    def fake_seed_from_query(query, vs):
        """Record whether GRAPH_LOCK is held during seeding, and return no seeds so answer_query short-circuits on the no-match path."""
        observed_locked_state["locked_during_seed"] = GRAPH_LOCK.locked()
        return []

    monkeypatch.setattr("backend.query_service.seed_from_query", fake_seed_from_query)

    assert not GRAPH_LOCK.locked()
    result = answer_query("what is machine learning?", graph_store, vector_store, cutoff=0.35)
    assert observed_locked_state["locked_during_seed"] is True
    assert not GRAPH_LOCK.locked()
    assert result["no_match"] is True


def test_lock_prevents_write_and_read_proceeding_simultaneously(tmp_path, monkeypatch):
    """
    Given a held GRAPH_LOCK (acquired manually in the main thread),
    when a concurrent write (process_file_change) attempts to acquire it on a
    second thread,
    the write should block until the main thread releases the lock (verified
    via a bounded-timeout thread.join()).

    Source: Feature: Ingestion/Query Lock Guarding — criterion 2; Issue 17 — criterion 2
    """
    sample_file = tmp_path / "sample.txt"
    sample_file.write_text("hello world", encoding="utf-8")
    hash_store_path = tmp_path / "hashes.json"
    graph_store = GraphStore()
    vector_store = _make_vector_store_stub()

    monkeypatch.setattr("backend.ingestion.watcher.pipeline.ingest_file", lambda path, gs, vector_store=None: None)
    monkeypatch.setattr("backend.ingestion.watcher.resolver.resolve_all", lambda gs: None)

    write_finished = threading.Event()

    def run_write():
        """Run process_file_change on a second thread and signal completion."""
        process_file_change(sample_file, graph_store, vector_store, hash_store_path)
        write_finished.set()

    GRAPH_LOCK.acquire()
    try:
        thread = threading.Thread(target=run_write)
        thread.start()
        # The write should still be blocked shortly after starting, since the
        # main thread holds GRAPH_LOCK.
        blocked_promptly = not write_finished.wait(timeout=0.3)
        assert blocked_promptly, "write proceeded while GRAPH_LOCK was held by another thread"
    finally:
        GRAPH_LOCK.release()

    thread.join(timeout=5)
    assert not thread.is_alive(), "write thread never finished after lock was released"
    assert write_finished.is_set()
