"""
Integration tests for concurrency guarding under realistic concurrent
ingestion-write / query-read scenarios.
"""
import pytest


def test_query_during_ingestion_write_never_sees_partial_graph(
    sample_graph, chroma_test_client, mock_extraction_llm
):
    """
    Given an ingestion write in progress (simulated with a controlled delay)
    and a concurrent query read,
    when both run concurrently,
    the query read should observe either the fully-pre-write or
    fully-post-write graph state, never a partial mutation.

    Source: Feature: Ingestion/Query Lock Guarding — criterion 1; Issue 17 — criterion 1
    """
    raise NotImplementedError


def test_near_simultaneous_file_change_and_query_do_not_deadlock(
    tmp_watch_folder, mock_extraction_llm, chroma_test_client
):
    """
    Given a file-change event and a chat query triggered in close succession,
    when both are processed,
    both should complete within a bounded timeout (no deadlock).

    Source: Feature: Ingestion/Query Lock Guarding — criterion 3; Issue 17 — criterion 3
    """
    raise NotImplementedError
