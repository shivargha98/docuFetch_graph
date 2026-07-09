"""
API tests for POST /api/ingest/upload: drag-and-drop folder ingestion.
Files arrive as multipart parts whose filenames carry folder-relative
paths; only .md/.txt/.pdf are saved, under UPLOADS_PATH/<folder_name>/,
and the shared folder-switch logic then ingests the saved copy.
"""
from unittest.mock import patch

import pytest

from backend import config
from backend.api import config_routes, upload_routes

UPLOAD_ENDPOINT = "/api/ingest/upload"


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path, monkeypatch):
    """Point UPLOADS_PATH at a temp dir and neutralize the real switch side-effects."""
    monkeypatch.setattr(upload_routes, "UPLOADS_PATH", str(tmp_path / "uploads"))
    with patch.object(upload_routes, "switch_to_folder") as mock_switch:
        yield mock_switch


def _post_files(client, folder_name, files):
    """POST helper: files is a list of (relative_path, content_bytes) tuples."""
    return client.post(
        UPLOAD_ENDPOINT,
        data={"folder_name": folder_name},
        files=[("files", (rel, content, "application/octet-stream")) for rel, content in files],
    )


def test_upload_saves_supported_files_and_switches(fastapi_test_client, tmp_path, _uploads_in_tmp):
    """Supported files are saved under UPLOADS_PATH/<folder_name>/ preserving relative paths, then switch runs."""
    response = _post_files(
        fastapi_test_client,
        "mynotes",
        [("a.md", b"# A"), ("sub/b.txt", b"B"), ("c.exe", b"nope")],
    )
    assert response.status_code == 200
    dest = tmp_path / "uploads" / "mynotes"
    assert (dest / "a.md").read_bytes() == b"# A"
    assert (dest / "sub" / "b.txt").read_bytes() == b"B"
    assert not (dest / "c.exe").exists()
    assert response.json() == {"path": str(dest), "status": "watching", "mode": "uploaded"}
    _uploads_in_tmp.assert_called_once()


def test_upload_replaces_existing_copy_of_same_folder(fastapi_test_client, tmp_path, _uploads_in_tmp):
    """Re-uploading a folder name wipes the previous copy first (stale files don't linger)."""
    _post_files(fastapi_test_client, "mynotes", [("old.md", b"old")])
    _post_files(fastapi_test_client, "mynotes", [("new.md", b"new")])
    dest = tmp_path / "uploads" / "mynotes"
    assert (dest / "new.md").exists()
    assert not (dest / "old.md").exists()


def test_upload_with_no_supported_files_returns_422_without_switching(fastapi_test_client, _uploads_in_tmp):
    """An upload containing zero ingestible files is rejected and no switch happens."""
    response = _post_files(fastapi_test_client, "junk", [("x.exe", b"x"), ("y.zip", b"y")])
    assert response.status_code == 422
    _uploads_in_tmp.assert_not_called()


def test_upload_rejects_path_traversal(fastapi_test_client, tmp_path, _uploads_in_tmp):
    """A relative path escaping the destination folder is rejected with 422."""
    response = _post_files(fastapi_test_client, "notes", [("../evil.md", b"evil")])
    assert response.status_code == 422
    assert not (tmp_path / "evil.md").exists()
    _uploads_in_tmp.assert_not_called()


def test_upload_rejects_traversal_folder_name(fastapi_test_client, tmp_path, _uploads_in_tmp):
    """A folder_name escaping UPLOADS_PATH is rejected with 422 and nothing is written outside it."""
    response = _post_files(fastapi_test_client, "../evil", [("a.md", b"# A")])
    assert response.status_code == 422
    assert not (tmp_path / "evil").exists()
    _uploads_in_tmp.assert_not_called()


def test_upload_rejects_empty_folder_name(fastapi_test_client, _uploads_in_tmp):
    """An empty folder_name (which would collapse onto the uploads root itself) is rejected with 422."""
    response = _post_files(fastapi_test_client, "", [("a.md", b"# A")])
    assert response.status_code == 422
    _uploads_in_tmp.assert_not_called()
