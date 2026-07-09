"""
API/contract tests for the folder-configuration endpoint: setting/switching
the watched folder from the UI.

Endpoint contract finalized per docs/backend/backend_context.md decision #6:
GET/POST /api/folder-config. See backend/api/config_routes.py for the
implementation these tests exercise.
"""
from unittest.mock import patch

import pytest

from backend import config
from backend.api import config_routes
from backend.chat_session import session as chat_session

FOLDER_CONFIG_ENDPOINT = "/api/folder-config"


@pytest.fixture(autouse=True)
def _reset_folder_config_state():
    """
    Reset config_routes' module-level `_current_folder`/`_current_watcher`
    state before and after every test in this file, since that state is
    process-level and would otherwise leak between tests run in the same
    session. Any leftover watcher is stopped (best-effort; a watcher whose
    `.start()` was mocked out in a given test was never actually started, so
    `.stop()` on it may raise - that's ignored here since it's just teardown
    of test-local state, not something under test).
    """

    def _reset():
        if config_routes._current_watcher is not None:
            try:
                config_routes._current_watcher.stop()
            except Exception:
                pass
        config_routes._current_folder = None
        config_routes._current_watcher = None

    _reset()
    yield
    _reset()


def test_first_load_reflects_watch_folder_as_default(fastapi_test_client):
    """
    Given a freshly started backend with no prior folder selection,
    when the folder-configuration endpoint is called,
    the response must report no active folder (path: null) — the app must
    not claim to watch anything the user never chose (amends the old
    WATCH_FOLDER-default behavior; the UI shows its folder chooser instead).

    Source: Feature: Folder Configuration Endpoint — criterion 1, amended 2026-07-09
    """
    response = fastapi_test_client.get(FOLDER_CONFIG_ENDPOINT)
    assert response.status_code == 200
    assert response.json() == {"path": None}


def test_submitting_new_folder_path_tears_down_and_restarts_watcher(fastapi_test_client, tmp_path):
    """
    Given a backend actively watching folder A,
    when a request is submitted to switch to folder B,
    the watcher/hash-store for folder A should be torn down and a fresh one
    started scoped to folder B.

    Source: Feature: Folder Configuration Endpoint — criterion 2; Issue 15 — criterion 2
    """
    folder_a = tmp_path / "a"
    folder_a.mkdir()
    folder_b = tmp_path / "b"
    folder_b.mkdir()

    with patch.object(config_routes.FolderWatcher, "start", autospec=True) as mock_start, patch.object(
        config_routes.FolderWatcher, "stop", autospec=True
    ) as mock_stop:
        response_a = fastapi_test_client.post(FOLDER_CONFIG_ENDPOINT, json={"path": str(folder_a)})
        assert response_a.status_code == 200
        watcher_after_a = config_routes._current_watcher
        assert mock_start.call_count == 1
        assert mock_stop.call_count == 0

        response_b = fastapi_test_client.post(FOLDER_CONFIG_ENDPOINT, json={"path": str(folder_b)})
        assert response_b.status_code == 200
        watcher_after_b = config_routes._current_watcher

        assert watcher_after_b is not watcher_after_a
        mock_stop.assert_called_once_with(watcher_after_a)
        assert mock_start.call_count == 2
        mock_start.assert_called_with(watcher_after_b)


def test_submitting_new_folder_path_resets_chat_session(fastapi_test_client, tmp_path):
    """
    Given an active chat session with turn history for folder A,
    when a request switches the folder to B,
    the session associated with the new folder should have no carried-over
    turn history.

    Source: Feature: Folder Configuration Endpoint — criterion 3; Issue 15 — criterion 3
    """
    session_a = chat_session.get_or_create_session("/some/folder/a")
    chat_session.add_turn(session_a, "What is X?", "X is Y.")
    assert chat_session.get_history(session_a) != []

    folder_b = tmp_path / "b"
    folder_b.mkdir()
    response = fastapi_test_client.post(FOLDER_CONFIG_ENDPOINT, json={"path": str(folder_b)})
    assert response.status_code == 200

    session_b = chat_session.get_or_create_session(str(folder_b))
    assert chat_session.get_history(session_b) == []


def test_submitting_new_folder_path_purges_previous_folder_vector_embeddings(
    fastapi_test_client, tmp_path, mock_embedding_client
):
    """
    Given the vector store holding an embedding ingested while watching
    folder A,
    when the watched folder is switched to folder B,
    the previous folder's embedding should no longer be present in the
    vector store — not just superseded, but actually purged — so it can't be
    retrieved alongside folder B's data.

    This was a known gap: VectorStore() always reopens the same on-disk
    Chroma collection regardless of which folder is active, so switching
    folders alone never removed stale embeddings until clear_all() was added.

    Source: Feature: Folder Configuration Endpoint — vector store cleanup on
    folder switch; Issue 15 caveat.
    """
    from backend.ingestion.chunking import Chunk
    from backend.vector_store import store as vector_store_module
    from backend.vector_store.store import VectorStore

    chroma_path = str(tmp_path / "chroma_test")
    folder_b = tmp_path / "b"
    folder_b.mkdir()

    with patch.object(vector_store_module, "CHROMA_DB_PATH", chroma_path), patch.object(
        config_routes.FolderWatcher, "start", autospec=True
    ), patch.object(config_routes.FolderWatcher, "stop", autospec=True):
        stale_store = VectorStore()
        stale_store.add_chunk(
            Chunk(chunk_id="stale-chunk", text="Old folder content.", source_file="old_file.md", section=None),
            ["concept_old"],
        )
        assert stale_store.collection.count() == 1

        response = fastapi_test_client.post(FOLDER_CONFIG_ENDPOINT, json={"path": str(folder_b)})
        assert response.status_code == 200

        fresh_store = VectorStore()
        assert fresh_store.collection.count() == 0


def test_folder_switch_reingests_content_whose_hashes_match_the_stale_hash_store(
    fastapi_test_client, tmp_path, mock_extraction_llm, mock_embedding_client
):
    """
    Given the hash store already records the exact content of a file in the
    target folder (re-upload of the same copy, or switching back to a
    previously-ingested folder),
    when the watched folder is switched,
    the file must still be re-ingested: switch_to_folder wipes the graph and
    vector stores, so the hash store must be purged with them — otherwise the
    diff-scan skips every hash-matched file, nothing repopulates the wiped
    graph, and the reconciliation thread dies instantly (empty graph and no
    "generating" signal for the UI).
    """
    import json
    from pathlib import Path

    from backend.ingestion.hash_store import compute_file_hash

    folder = tmp_path / "b"
    folder.mkdir()
    doc = folder / "doc.md"
    doc.write_text("# Doc\nAlpha concept text.", encoding="utf-8")

    hash_store_path = Path(config.HASH_STORE_PATH)
    hash_store_path.parent.mkdir(parents=True, exist_ok=True)
    hash_store_path.write_text(json.dumps({str(doc): compute_file_hash(doc)}), encoding="utf-8")

    mock_extraction_llm.set_response(
        {"concepts": [{"name": "Alpha", "description": "the first concept"}], "relations": []}
    )

    with patch.object(config_routes.FolderWatcher, "start", autospec=True), patch.object(
        config_routes.FolderWatcher, "stop", autospec=True
    ):
        response = fastapi_test_client.post(FOLDER_CONFIG_ENDPOINT, json={"path": str(folder)})
        assert response.status_code == 200
        config_routes._current_ingest_thread.join(timeout=10)

    persisted = json.loads(Path(config.GRAPH_STORE_PATH).read_text(encoding="utf-8"))
    assert any(node["id"] == "concept_alpha" for node in persisted["nodes"])


def test_submitting_invalid_folder_path_returns_error_without_crashing(fastapi_test_client):
    """
    Given a running backend,
    when a request submits a non-existent/invalid path,
    the response should be an error (4xx) rather than a crash or hang, and
    the backend should continue serving subsequent requests normally.

    Source: Feature: Folder Configuration Endpoint — criterion 4; Issue 15 — criterion 4
    """
    response = fastapi_test_client.post(FOLDER_CONFIG_ENDPOINT, json={"path": "/definitely/does/not/exist/xyz"})
    assert 400 <= response.status_code < 500

    followup = fastapi_test_client.get(FOLDER_CONFIG_ENDPOINT)
    assert followup.status_code == 200


def test_folder_config_request_response_shape_matches_finalized_contract(fastapi_test_client, tmp_path):
    """
    Given a finalized folder-configuration endpoint contract,
    when a request is made against it,
    the request/response payload shape should match the finalized contract.

    Contract (docs/backend/backend_context.md decision #6):
    GET -> {"path": <str>}
    POST {"path": <str>} -> 200 {"path": <str>, "status": "watching"}

    Source: Issue 15 — caveat (open question: exact endpoint path/payload shape), now resolved.
    """
    get_response = fastapi_test_client.get(FOLDER_CONFIG_ENDPOINT)
    assert get_response.status_code == 200
    assert set(get_response.json().keys()) == {"path"}

    new_folder = tmp_path / "shape_test_folder"
    new_folder.mkdir()
    post_response = fastapi_test_client.post(FOLDER_CONFIG_ENDPOINT, json={"path": str(new_folder)})
    assert post_response.status_code == 200
    assert post_response.json() == {"path": str(new_folder), "status": "watching"}
