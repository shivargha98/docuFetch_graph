"""
Integration tests for incremental ingestion: the folder watcher, hash-based
change detection, debouncing, file-deletion cleanup, and startup
load-then-diff-scan behavior.
"""
import pytest


def test_adding_file_triggers_ingestion_for_that_file_only(tmp_watch_folder, mock_extraction_llm):
    """
    Given a running watcher over a folder with existing ingested files,
    when a new file is added to the folder,
    only the new file should be ingested; existing files' hashes/graph
    entries should be untouched.

    Source: Feature: Folder Watcher & Incremental Change Detection —
    criterion 1; Issue 6 — criterion 1
    """
    raise NotImplementedError


def test_unchanged_file_resave_does_not_trigger_reextraction(sample_markdown_file, mock_extraction_llm):
    """
    Given an ingested file with a recorded hash,
    when the file is re-saved with identical content,
    no re-extraction call should be made for that file.

    Source: Feature: Folder Watcher & Incremental Change Detection —
    criterion 2; Issue 6 — criterion 2
    """
    raise NotImplementedError


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
    raise NotImplementedError


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
    raise NotImplementedError


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
    raise NotImplementedError


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
    raise NotImplementedError
