"""
Integration tests for concurrency guarding under realistic concurrent
ingestion-write / query-read scenarios.
"""
import threading
import time

from backend.graph_store.store import GraphStore
from backend.ingestion.watcher import process_file_change
from backend.query_service import answer_query


def test_query_during_ingestion_write_never_sees_partial_graph(
    sample_graph, chroma_test_client, mock_extraction_llm, monkeypatch, tmp_path
):
    """
    Given an ingestion write in progress (simulated with a controlled delay)
    and a concurrent query read,
    when both run concurrently,
    the query read should observe either the fully-pre-write or
    fully-post-write graph state, never a partial mutation.

    `pipeline.ingest_file` is monkeypatched to add two nodes with a sleep in
    between (simulating a multi-step write), so an unguarded read would have
    a real chance of observing the graph mid-mutation (3 -> 4 -> 5 nodes).
    `resolver.resolve_all` is monkeypatched to a no-op since entity
    resolution's own correctness isn't this test's concern and would
    otherwise make real (unmocked) embedding calls. `query_service.
    seed_from_query` is replaced with a spy that records
    `graph_store.graph.number_of_nodes()` every time the read's locked
    seeding section actually executes, which is exactly the window we want
    to inspect.

    Source: Feature: Ingestion/Query Lock Guarding — criterion 1; Issue 17 — criterion 1
    """
    graph_store = GraphStore(graph=sample_graph)
    vector_store = chroma_test_client
    pre_count = graph_store.graph.number_of_nodes()

    sample_file = tmp_path / "sample.txt"
    sample_file.write_text("some new content", encoding="utf-8")
    hash_store_path = tmp_path / "hashes.json"

    write_started = threading.Event()

    def fake_ingest_file(path, gs, vector_store=None):
        """Add two nodes with a sleep in between, simulating a multi-step write with a real race window."""
        gs.graph.add_node("concept_interim", id="concept_interim", name="Interim", description="", source_files=[str(path)])
        write_started.set()
        time.sleep(0.3)
        gs.graph.add_node("concept_final", id="concept_final", name="Final", description="", source_files=[str(path)])

    monkeypatch.setattr("backend.ingestion.watcher.pipeline.ingest_file", fake_ingest_file)
    monkeypatch.setattr("backend.ingestion.watcher.resolver.resolve_all", lambda gs: None)

    post_count = pre_count + 2

    observed_counts = []

    def spy_seed_from_query(query, vs):
        """Record the graph's node count at the exact moment the read's locked seeding section runs, then return no seeds so answer_query short-circuits quickly."""
        observed_counts.append(graph_store.graph.number_of_nodes())
        return []

    monkeypatch.setattr("backend.query_service.seed_from_query", spy_seed_from_query)

    errors = []

    def run_write():
        """Run the (faked) ingestion write on a background thread."""
        try:
            process_file_change(sample_file, graph_store, vector_store, hash_store_path)
        except Exception as exc:  # pragma: no cover - surfaced via `errors` assertion below
            errors.append(exc)

    write_thread = threading.Thread(target=run_write)
    write_thread.start()
    assert write_started.wait(timeout=2), "write never started"

    reader_stop = threading.Event()

    def run_reader():
        """Repeatedly issue queries while the write is in flight, until told to stop."""
        while not reader_stop.is_set():
            try:
                answer_query("what is this about?", graph_store, vector_store, cutoff=0.35)
            except Exception as exc:  # pragma: no cover - surfaced via `errors` assertion below
                errors.append(exc)
            time.sleep(0.01)

    reader_thread = threading.Thread(target=run_reader)
    reader_thread.start()

    write_thread.join(timeout=5)
    assert not write_thread.is_alive(), "write thread never finished"
    reader_stop.set()
    reader_thread.join(timeout=5)
    assert not reader_thread.is_alive(), "reader thread never finished"

    assert not errors, f"unexpected errors in background threads: {errors}"
    assert graph_store.graph.number_of_nodes() == post_count
    assert observed_counts, "no reads were captured during the test"
    assert set(observed_counts) <= {pre_count, post_count}, (
        f"observed a partial/torn node count outside {{{pre_count}, {post_count}}}: {observed_counts}"
    )


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
