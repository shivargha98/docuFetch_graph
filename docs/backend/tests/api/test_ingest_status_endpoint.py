"""
API tests for GET /api/ingest-status: reports whether the folder-switch
reconciliation thread is still running, so the frontend can drive its
"graph is generating" animation off a real signal.
"""
import threading
from unittest.mock import patch

import pytest

from backend import config
from backend.api import config_routes

INGEST_STATUS_ENDPOINT = "/api/ingest-status"


@pytest.fixture(autouse=True)
def _reset_folder_config_state():
    """Reset config_routes module state around each test (same pattern as test_folder_config_endpoint.py)."""
    def _reset():
        if config_routes._current_watcher is not None:
            try:
                config_routes._current_watcher.stop()
            except Exception:
                pass
        config_routes._current_folder = config.WATCH_FOLDER
        config_routes._current_watcher = None
        config_routes._current_ingest_thread = None
    _reset()
    yield
    _reset()


def test_status_is_idle_when_no_switch_has_happened(fastapi_test_client):
    """Given a fresh backend, ingest-status reports ingesting: False and the current folder path."""
    response = fastapi_test_client.get(INGEST_STATUS_ENDPOINT)
    assert response.status_code == 200
    assert response.json() == {"ingesting": False, "path": config.WATCH_FOLDER}


def test_status_reports_ingesting_while_reconciliation_thread_alive(fastapi_test_client):
    """Given a switch whose reconciliation thread is still running, ingesting is True; once it finishes, False."""
    release = threading.Event()
    thread = threading.Thread(target=release.wait)
    thread.start()
    config_routes._current_ingest_thread = thread
    try:
        assert fastapi_test_client.get(INGEST_STATUS_ENDPOINT).json()["ingesting"] is True
    finally:
        release.set()
        thread.join()
    assert fastapi_test_client.get(INGEST_STATUS_ENDPOINT).json()["ingesting"] is False


def test_folder_switch_records_ingest_thread(fastapi_test_client, tmp_path):
    """POST /api/folder-config stores the startup reconciliation thread in module state."""
    folder = tmp_path / "f"
    folder.mkdir()
    with patch.object(config_routes.FolderWatcher, "start", autospec=True), patch.object(
        config_routes.FolderWatcher, "stop", autospec=True
    ):
        response = fastapi_test_client.post("/api/folder-config", json={"path": str(folder)})
        assert response.status_code == 200
    assert config_routes._current_ingest_thread is not None
