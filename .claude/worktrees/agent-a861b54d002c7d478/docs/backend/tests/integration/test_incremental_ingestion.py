"""
Integration tests for incremental ingestion: the folder watcher, hash-based
change detection, debouncing, file-deletion cleanup, and startup
load-then-diff-scan behavior.
"""
import json
import time

import pytest

from backend.clients import openrouter_client
from backend.graph_store.store import GraphStore
from backend.ingestion import pipeline
from backend.ingestion.startup import startup
from backend.ingestion.watcher import FolderWatcher, process_file_change, process_file_deletion

_EMBED_DIM = 32


def _make_orthogonal_embed_text():
    """
    Build an embed_text stand-in for tests that exercise real ingestion
    (and therefore real calls to entity_resolution.resolver.resolve_all,
    which embeds every graph node's "name: description" text, and/or real
    calls to VectorStore.add_chunk/query).

    Every distinct text seen is assigned its own axis in a fixed-length
    one-hot vector (assigned in first-seen order), so unrelated
    concepts/chunks always have cosine similarity 0 (never accidentally
    cross entity-resolution's merge thresholds) while identical text
    reproduces the same vector. The vector length is fixed (not grown per
    call) because Chroma requires every embedding in a collection to share
    the same dimensionality.
    """
    assigned: dict[str, int] = {}

    def embed_text(text: str) -> list[float]:
        """Return this test run's deterministic one-hot vector for `text`."""
        if text not in assigned:
            assigned[text] = len(assigned)
        vector = [0.0] * _EMBED_DIM
        vector[assigned[text] % _EMBED_DIM] = 1.0
        return vector

    return embed_text


def test_adding_file_triggers_ingestion_for_that_file_only(tmp_watch_folder, mock_extraction_llm):
    """
    Given a running watcher over a folder with existing ingested files,
    when a new file is added to the folder,
    only the new file should be ingested; existing files' hashes/graph
    entries should be untouched.

    Source: Feature: Folder Watcher & Incremental Change Detection —
    criterion 1; Issue 6 — criterion 1
    """
    existing_path = tmp_watch_folder / "existing.md"
    existing_path.write_text("# Existing\nContent about Existing Concept.\n", encoding="utf-8")

    graph_store = GraphStore()
    hash_store_path = tmp_watch_folder.parent / "hash_store.json"

    original_embed_text = openrouter_client.embed_text
    openrouter_client.embed_text = _make_orthogonal_embed_text()
    new_path = tmp_watch_folder / "new.md"
    try:
        mock_extraction_llm.set_response(
            {"concepts": [{"name": "Existing Concept", "description": "desc"}], "relations": []}
        )
        process_file_change(existing_path, graph_store, None, hash_store_path)
        hashes_before = json.loads(hash_store_path.read_text())

        watcher = FolderWatcher(tmp_watch_folder, graph_store, None, hash_store_path, debounce_seconds=0.05)
        watcher.start()
        try:
            mock_extraction_llm.set_response(
                {"concepts": [{"name": "New Concept", "description": "desc"}], "relations": []}
            )
            new_path.write_text("# New\nContent about New Concept.\n", encoding="utf-8")
            time.sleep(0.4)
        finally:
            watcher.stop()
    finally:
        openrouter_client.embed_text = original_embed_text

    hashes_after = json.loads(hash_store_path.read_text())
    assert hashes_after[str(existing_path)] == hashes_before[str(existing_path)]
    assert str(new_path) in hashes_after
    assert graph_store.graph.has_node("concept_new_concept")
    assert graph_store.graph.has_node("concept_existing_concept")


def test_unchanged_file_resave_does_not_trigger_reextraction(sample_markdown_file, mock_extraction_llm):
    """
    Given an ingested file with a recorded hash,
    when the file is re-saved with identical content,
    no re-extraction call should be made for that file.

    Source: Feature: Folder Watcher & Incremental Change Detection —
    criterion 2; Issue 6 — criterion 2
    """
    graph_store = GraphStore()
    hash_store_path = sample_markdown_file.parent.parent / "hash_store.json"

    original_embed_text = openrouter_client.embed_text
    openrouter_client.embed_text = _make_orthogonal_embed_text()
    call_count = {"n": 0}
    try:
        mock_extraction_llm.set_response(
            {"concepts": [{"name": "Machine Learning", "description": "desc"}], "relations": []}
        )
        first_result = process_file_change(sample_markdown_file, graph_store, None, hash_store_path)
        assert first_result is True

        def counting_wrapper(chunk_text):
            """Count calls while delegating to the already-mocked extract_concepts."""
            call_count["n"] += 1
            return mock_extraction_llm(chunk_text)

        openrouter_client.extract_concepts = counting_wrapper
        try:
            content = sample_markdown_file.read_text(encoding="utf-8")
            sample_markdown_file.write_text(content, encoding="utf-8")
            second_result = process_file_change(sample_markdown_file, graph_store, None, hash_store_path)
        finally:
            openrouter_client.extract_concepts = mock_extraction_llm
    finally:
        openrouter_client.embed_text = original_embed_text

    assert second_result is False
    assert call_count["n"] == 0


def test_rapid_successive_saves_are_debounced_into_one_ingestion_pass(
    sample_markdown_file, mock_extraction_llm
):
    """
    Given a file receiving several rapid successive write events (simulated
    autosave),
    when the watcher processes these events,
    exactly one ingestion pass should run for that file, not one per write
    event.

    Source: Feature: Folder Watcher & Incremental Change Detection —
    criterion 5; Issue 6 — criterion 4
    """
    mock_extraction_llm.set_response(
        {"concepts": [{"name": "Machine Learning", "description": "desc"}], "relations": []}
    )

    original_embed_text = openrouter_client.embed_text
    openrouter_client.embed_text = _make_orthogonal_embed_text()

    original_ingest_file = pipeline.ingest_file
    call_count = {"n": 0}

    def counting_ingest_file(path, graph_store, vector_store=None):
        """Count calls while delegating to the real ingest_file."""
        call_count["n"] += 1
        return original_ingest_file(path, graph_store, vector_store=vector_store)

    pipeline.ingest_file = counting_ingest_file

    graph_store = GraphStore()
    watch_folder = sample_markdown_file.parent
    hash_store_path = watch_folder.parent / "hash_store.json"

    watcher = FolderWatcher(watch_folder, graph_store, None, hash_store_path, debounce_seconds=0.05)
    watcher.start()
    try:
        content = sample_markdown_file.read_text(encoding="utf-8")
        for _ in range(5):
            sample_markdown_file.write_text(content, encoding="utf-8")
            time.sleep(0.01)
        time.sleep(0.4)
    finally:
        watcher.stop()
        pipeline.ingest_file = original_ingest_file
        openrouter_client.embed_text = original_embed_text

    assert call_count["n"] == 1


def test_deleting_watched_file_cleans_up_graph_and_vector_store(
    tmp_watch_folder, mock_extraction_llm, chroma_test_client
):
    """
    Given an ingested file with graph nodes and Chroma embeddings, some
    concepts shared with another file,
    when the file is deleted from the watched folder,
    Chroma embeddings solely from the deleted file should be removed, graph
    nodes/edges solely attributable to it should be removed, and concepts
    shared with the other still-present file should remain.

    Source: Issue 7 — full acceptance criteria
    """
    file_a = tmp_watch_folder / "file_a.md"
    file_a.write_text("# A\nContent about Shared Concept and Concept Only In A.\n", encoding="utf-8")
    file_b = tmp_watch_folder / "file_b.md"
    file_b.write_text("# B\nContent about Shared Concept and Concept Only In B.\n", encoding="utf-8")

    graph_store = GraphStore()
    vector_store = chroma_test_client
    hash_store_path = tmp_watch_folder.parent / "hash_store.json"

    original_embed_text = openrouter_client.embed_text
    openrouter_client.embed_text = _make_orthogonal_embed_text()
    try:
        mock_extraction_llm.set_response(
            {
                "concepts": [
                    {"name": "Shared Concept", "description": "desc"},
                    {"name": "Concept Only In A", "description": "desc"},
                ],
                "relations": [],
            }
        )
        process_file_change(file_a, graph_store, vector_store, hash_store_path)

        mock_extraction_llm.set_response(
            {
                "concepts": [
                    {"name": "Shared Concept", "description": "desc"},
                    {"name": "Concept Only In B", "description": "desc"},
                ],
                "relations": [],
            }
        )
        process_file_change(file_b, graph_store, vector_store, hash_store_path)

        assert graph_store.graph.has_node("concept_shared_concept")
        assert graph_store.graph.has_node("concept_concept_only_in_a")
        assert graph_store.graph.has_node("concept_concept_only_in_b")

        matches_before = vector_store.query("Concept Only In A", top_k=10)
        assert any(match["source_file"] == str(file_a) for match in matches_before)

        file_a.unlink()
        process_file_deletion(file_a, graph_store, vector_store, hash_store_path)

        assert not graph_store.graph.has_node("concept_concept_only_in_a")
        assert graph_store.graph.has_node("concept_shared_concept")
        assert str(file_a) not in graph_store.graph.nodes["concept_shared_concept"]["source_files"]
        assert graph_store.graph.has_node("concept_concept_only_in_b")

        matches_after = vector_store.query("Concept Only In A", top_k=10)
        assert all(match["source_file"] != str(file_a) for match in matches_after)
    finally:
        openrouter_client.embed_text = original_embed_text


def test_startup_loads_persisted_graph_immediately_then_reconciles_offline_changes(
    tmp_path, tmp_watch_folder, mock_extraction_llm
):
    """
    Given a previously persisted graph/hash-store, and a watched folder where
    a file was added and another deleted while the backend was "offline"
    (simulated),
    when the backend starts up,
    the persisted graph should be available immediately (before the
    background diff-scan completes), the scan should ingest the offline-added
    file and clean up the offline-deleted file, and unchanged files should not
    be re-processed.

    Source: Issue 8 — full acceptance criteria
    """
    graph_store_path = tmp_path / "graph_store.json"
    hash_store_path = tmp_path / "hash_store.json"

    unchanged_file = tmp_watch_folder / "unchanged.md"
    unchanged_file.write_text("# Unchanged\nContent about Persisted Concept.\n", encoding="utf-8")
    delete_me_file = tmp_watch_folder / "delete_me.md"
    delete_me_file.write_text("# DeleteMe\nContent about Doomed Concept.\n", encoding="utf-8")

    original_embed_text = openrouter_client.embed_text
    openrouter_client.embed_text = _make_orthogonal_embed_text()
    new_file = tmp_watch_folder / "added_offline.md"
    ingest_calls: list = []
    try:
        initial_graph = GraphStore()
        mock_extraction_llm.set_response(
            {"concepts": [{"name": "Persisted Concept", "description": "desc"}], "relations": []}
        )
        process_file_change(unchanged_file, initial_graph, None, hash_store_path)

        mock_extraction_llm.set_response(
            {"concepts": [{"name": "Doomed Concept", "description": "desc"}], "relations": []}
        )
        process_file_change(delete_me_file, initial_graph, None, hash_store_path)
        initial_graph.persist(graph_store_path)

        # Simulate offline changes: one file deleted, one file added, while no watcher was running.
        delete_me_file.unlink()
        new_file.write_text("# AddedOffline\nContent about Offline Concept.\n", encoding="utf-8")
        mock_extraction_llm.set_response(
            {"concepts": [{"name": "Offline Concept", "description": "desc"}], "relations": []}
        )

        original_extract_concepts = openrouter_client.extract_concepts
        original_ingest_file = pipeline.ingest_file

        def slow_extract_concepts(chunk_text):
            """Delay extraction slightly so the test can observe state before the background scan finishes."""
            time.sleep(0.2)
            return original_extract_concepts(chunk_text)

        def counting_ingest_file(path, graph_store, vector_store=None):
            """Record which files the background scan actually ran the ingestion pipeline for."""
            ingest_calls.append(path)
            return original_ingest_file(path, graph_store, vector_store=vector_store)

        openrouter_client.extract_concepts = slow_extract_concepts
        pipeline.ingest_file = counting_ingest_file
        try:
            graph_store, thread = startup(tmp_watch_folder, graph_store_path, hash_store_path, vector_store=None)

            # The persisted graph must be usable immediately, before the background scan finishes.
            assert graph_store.graph.has_node("concept_persisted_concept")
            assert graph_store.graph.has_node("concept_doomed_concept")
            assert not graph_store.graph.has_node("concept_offline_concept")

            thread.join(timeout=5)
        finally:
            openrouter_client.extract_concepts = original_extract_concepts
            pipeline.ingest_file = original_ingest_file
    finally:
        openrouter_client.embed_text = original_embed_text

    assert graph_store.graph.has_node("concept_offline_concept")
    assert not graph_store.graph.has_node("concept_doomed_concept")
    assert graph_store.graph.has_node("concept_persisted_concept")

    # Only the offline-added file should have gone through the ingestion pipeline;
    # the unchanged file's hash matched, so it must have been skipped.
    assert ingest_calls == [new_file]

    hashes = json.loads(hash_store_path.read_text())
    assert str(new_file) in hashes
    assert str(delete_me_file) not in hashes
    assert str(unchanged_file) in hashes


def test_first_ever_startup_with_no_prior_state_performs_full_ingestion(
    tmp_watch_folder, mock_extraction_llm
):
    """
    Given no prior persisted graph/hash-store exists, and a watched folder
    with files present,
    when the backend starts up,
    a full ingestion run should occur instead of failing or waiting
    indefinitely.

    Source: Issue 8 — criterion 5
    """
    first_file = tmp_watch_folder / "first.md"
    first_file.write_text("# First\nContent about Fresh Concept.\n", encoding="utf-8")

    graph_store_path = tmp_watch_folder.parent / "graph_store.json"
    hash_store_path = tmp_watch_folder.parent / "hash_store.json"
    assert not graph_store_path.exists()
    assert not hash_store_path.exists()

    original_embed_text = openrouter_client.embed_text
    openrouter_client.embed_text = _make_orthogonal_embed_text()
    try:
        mock_extraction_llm.set_response(
            {"concepts": [{"name": "Fresh Concept", "description": "desc"}], "relations": []}
        )

        graph_store, thread = startup(tmp_watch_folder, graph_store_path, hash_store_path, vector_store=None)
        assert graph_store.graph.number_of_nodes() == 0

        thread.join(timeout=5)
    finally:
        openrouter_client.embed_text = original_embed_text

    assert graph_store.graph.has_node("concept_fresh_concept")

    hashes = json.loads(hash_store_path.read_text())
    assert str(first_file) in hashes
