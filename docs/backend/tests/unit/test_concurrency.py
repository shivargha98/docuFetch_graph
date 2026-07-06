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


def test_lock_is_acquired_before_write_and_released_after(tmp_path, monkeypatch):
    """
    Given an ingestion write operation (process_file_change) and GRAPH_LOCK
    wrapping graph_store + vector_store access,
    when the write operation executes,
    the lock should be held for the duration of the write and released
    afterward.

    Source: Feature: Ingestion/Query Lock Guarding — criterion 1 (unit-level
    lock behavior); Issue 17 — criterion 1
    """
    sample_file = tmp_path / "sample.txt"
    sample_file.write_text("hello world", encoding="utf-8")
    hash_store_path = tmp_path / "hashes.json"
    graph_store = GraphStore()
    vector_store = _make_vector_store_stub()

    observed_locked_state = {}

    def fake_ingest_file(path, gs, vector_store=None):
        """Record whether GRAPH_LOCK is held while pipeline.ingest_file would normally run."""
        observed_locked_state["locked_during_write"] = GRAPH_LOCK.locked()
        return None

    monkeypatch.setattr("backend.ingestion.watcher.pipeline.ingest_file", fake_ingest_file)
    monkeypatch.setattr("backend.ingestion.watcher.resolver.resolve_all", lambda gs: None)

    assert not GRAPH_LOCK.locked()
    process_file_change(sample_file, graph_store, vector_store, hash_store_path)
    assert observed_locked_state["locked_during_write"] is True
    assert not GRAPH_LOCK.locked()

    # Also exercise process_file_deletion's lock usage the same way.
    observed_locked_state.clear()

    def fake_remove_file(source_file):
        """Record whether GRAPH_LOCK is held while graph_store.remove_file would normally run."""
        observed_locked_state["locked_during_delete"] = GRAPH_LOCK.locked()

    monkeypatch.setattr(graph_store, "remove_file", fake_remove_file)
    monkeypatch.setattr(graph_store, "persist", lambda path: None)

    process_file_deletion(sample_file, graph_store, vector_store, hash_store_path)
    assert observed_locked_state["locked_during_delete"] is True
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
