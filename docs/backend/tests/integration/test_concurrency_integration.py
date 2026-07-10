"""
Integration tests for concurrency guarding under realistic concurrent
ingestion-write / query-read scenarios.
"""
import threading
import time

from backend.concurrency.lock import GRAPH_LOCK
from backend.graph_store.store import GraphStore
from backend.ingestion.watcher import process_file_change
from backend.query_service import answer_query


def test_query_completes_during_slow_ingestion_and_sees_consistent_state(
    sample_graph, chroma_test_client, mock_extraction_llm, monkeypatch, tmp_path
):
    """
    Given a slow ingestion in progress (simulating per-chunk LLM extraction
    with a sleep OUTSIDE the lock, then a locked mutation — the fine-grained
    locking model, 2026-07-10),
    when queries run concurrently,
    they complete WHILE the ingestion is still mid-file (previously they
    queued behind a whole-file lock for the LLM's full duration) and only
    ever observe consistent per-mutation node counts — they traverse
    whatever concepts have already landed.

    Source: Issue 17, amended by the fine-grained locking rework (user
    request: "chat should traverse the graphs that are already there").
    """
    graph_store = GraphStore(graph=sample_graph)
    vector_store = chroma_test_client
    pre_count = graph_store.graph.number_of_nodes()

    sample_file = tmp_path / "sample.txt"
    sample_file.write_text("some new content", encoding="utf-8")
    hash_store_path = tmp_path / "hashes.json"

    write_started = threading.Event()

    def fake_ingest_file(path, gs, vector_store=None):
        """Mimic the real pipeline's locking: slow work unlocked, mutations locked."""
        write_started.set()
        time.sleep(0.5)  # "LLM extraction" — holds NO lock
        with GRAPH_LOCK:
            gs.graph.add_node("concept_interim", id="concept_interim", name="Interim", description="", source_files=[str(path)])
        time.sleep(0.5)  # second "chunk extraction"
        with GRAPH_LOCK:
            gs.graph.add_node("concept_final", id="concept_final", name="Final", description="", source_files=[str(path)])

    monkeypatch.setattr("backend.ingestion.watcher.pipeline.ingest_file", fake_ingest_file)
    monkeypatch.setattr("backend.ingestion.watcher.resolver.resolve_all", lambda gs: None)

    observed_counts = []

    def spy_seed_from_query(query, vs):
        """Record the node count at the moment the read's locked seeding section runs; return no seeds so answer_query short-circuits quickly."""
        observed_counts.append(graph_store.graph.number_of_nodes())
        return []

    monkeypatch.setattr("backend.query_service.seed_from_query", spy_seed_from_query)

    errors = []

    def run_write():
        """Run the (faked) slow ingestion on a background thread."""
        try:
            process_file_change(sample_file, graph_store, vector_store, hash_store_path)
        except Exception as exc:  # pragma: no cover - surfaced via `errors` assertion below
            errors.append(exc)

    write_thread = threading.Thread(target=run_write)
    write_thread.start()
    assert write_started.wait(timeout=2), "write never started"

    # THE new guarantee: a query issued mid-ingestion completes long before
    # the ingestion does, instead of queuing behind a whole-file lock.
    result = answer_query("what is this about?", graph_store, vector_store, cutoff=0.35)
    assert result["no_match"] is True
    assert write_thread.is_alive(), "ingestion should still be mid-file when the query returns"

    write_thread.join(timeout=5)
    assert not write_thread.is_alive(), "write thread never finished"
    assert not errors, f"unexpected errors in background threads: {errors}"
    assert graph_store.graph.number_of_nodes() == pre_count + 2
    # Reads only ever saw whole-mutation states: pre, +1, or +2 nodes.
    assert observed_counts, "no reads were captured during the test"
    assert set(observed_counts) <= {pre_count, pre_count + 1, pre_count + 2}


def test_near_simultaneous_file_change_and_query_do_not_deadlock(
    tmp_watch_folder,
    mock_extraction_llm,
    chroma_test_client,
    mock_embedding_client,
    mock_traversal_llm,
    mock_haiku_client,
    monkeypatch,
):
    """
    Given a file-change event and a chat query triggered in close succession,
    when both are processed,
    both should complete within a bounded timeout (no deadlock).

    Uses the real `process_file_change` and `answer_query` entry points
    (not faked), with `mock_extraction_llm`/`mock_embedding_client`/
    `mock_traversal_llm`/`mock_haiku_client` covering every external LLM/
    embedding call so the test runs fully offline and deterministically.
    `resolver.resolve_all` is monkeypatched to a no-op since entity
    resolution's own correctness isn't this test's concern.

    Source: Feature: Ingestion/Query Lock Guarding — criterion 3; Issue 17 — criterion 3
    """
    monkeypatch.setattr("backend.ingestion.watcher.resolver.resolve_all", lambda gs: None)
    mock_extraction_llm.set_response(
        {"concepts": [{"name": "Deep Learning", "description": "A subfield of machine learning."}], "relations": []}
    )

    sample_file = tmp_watch_folder / "sample.txt"
    sample_file.write_text("Deep learning uses neural networks with many layers.", encoding="utf-8")
    hash_store_path = tmp_watch_folder.parent / "hashes.json"

    graph_store = GraphStore()
    vector_store = chroma_test_client

    errors = []

    def run_write():
        """Run a real file-change ingestion on a background thread."""
        try:
            process_file_change(sample_file, graph_store, vector_store, hash_store_path)
        except Exception as exc:  # pragma: no cover - surfaced via `errors` assertion below
            errors.append(exc)

    def run_query():
        """Run a real chat query on a background thread, in close succession with the write."""
        try:
            answer_query("what is deep learning?", graph_store, vector_store, cutoff=0.35)
        except Exception as exc:  # pragma: no cover - surfaced via `errors` assertion below
            errors.append(exc)

    write_thread = threading.Thread(target=run_write)
    query_thread = threading.Thread(target=run_query)

    write_thread.start()
    query_thread.start()

    write_thread.join(timeout=5)
    query_thread.join(timeout=5)

    assert not write_thread.is_alive(), "write thread never finished (possible deadlock)"
    assert not query_thread.is_alive(), "query thread never finished (possible deadlock)"
    assert not errors, f"unexpected errors in background threads: {errors}"
