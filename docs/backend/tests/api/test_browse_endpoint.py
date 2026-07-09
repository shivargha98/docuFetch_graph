"""
API tests for GET /api/browse: server-side directory listing that powers the
frontend's folder-browser modal (directories only, unreadable entries
skipped, parent navigation, optional Windows drive list).
"""
BROWSE_ENDPOINT = "/api/browse"


def test_browse_lists_subdirectories_only(fastapi_test_client, tmp_path):
    """Given a directory containing subdirs and files, only subdirs are returned, sorted by name."""
    (tmp_path / "beta").mkdir()
    (tmp_path / "alpha").mkdir()
    (tmp_path / "notes.md").write_text("hi")
    response = fastapi_test_client.get(BROWSE_ENDPOINT, params={"path": str(tmp_path)})
    assert response.status_code == 200
    body = response.json()
    assert body["path"] == str(tmp_path)
    assert [d["name"] for d in body["dirs"]] == ["alpha", "beta"]
    assert body["dirs"][0]["path"] == str(tmp_path / "alpha")


def test_browse_without_path_starts_at_home(fastapi_test_client):
    """No path param starts at the user's home directory."""
    from pathlib import Path
    response = fastapi_test_client.get(BROWSE_ENDPOINT)
    assert response.status_code == 200
    assert response.json()["path"] == str(Path.home())


def test_browse_parent_is_null_at_filesystem_root(fastapi_test_client):
    """At a filesystem root (path.parent == path), parent is null; elsewhere it's the parent path."""
    response = fastapi_test_client.get(BROWSE_ENDPOINT, params={"path": "/"})
    assert response.status_code == 200
    assert response.json()["parent"] is None


def test_browse_invalid_path_returns_422(fastapi_test_client):
    """A non-existent or non-directory path returns 422 with a detail message."""
    assert fastapi_test_client.get(BROWSE_ENDPOINT, params={"path": "/does/not/exist"}).status_code == 422


def test_browse_skips_unreadable_entries(fastapi_test_client, tmp_path, monkeypatch):
    """Entries that raise OSError during the directory check are skipped, not fatal."""
    (tmp_path / "ok").mkdir()
    (tmp_path / "bad").mkdir()
    from pathlib import Path
    original_is_dir = Path.is_dir

    def flaky_is_dir(self):
        if self.name == "bad":
            raise OSError("simulated permission failure")
        return original_is_dir(self)

    monkeypatch.setattr(Path, "is_dir", flaky_is_dir)
    response = fastapi_test_client.get(BROWSE_ENDPOINT, params={"path": str(tmp_path)})
    assert response.status_code == 200
    assert [d["name"] for d in response.json()["dirs"]] == ["ok"]
