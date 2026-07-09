# Folder Selection Rework + Generation Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the folder panel's absolute-path text input with a server-side directory browser and drag-and-drop folder upload, and show a live "graph is generating" animation during ingestion.

**Architecture:** Backend grows three endpoints (`GET /api/browse`, `POST /api/ingest/upload`, `GET /api/ingest-status`) plus a shared `switch_to_folder` helper extracted from `config_routes`. Frontend replaces `FolderPathInput` with a drop zone + browse modal, adds a `generating` flag to the graph state slice (set on genuine folder switch, cleared when `/api/ingest-status` reports idle), and renders a scanning overlay on the graph viewport while generating.

**Tech Stack:** FastAPI + pytest (backend), React 19 + TS + Tailwind v4 + Vitest/RTL (frontend). New backend dep: `python-multipart` (FastAPI file uploads).

**Spec:** `docs/superpowers/specs/2026-07-06-folder-selection-rework-design.md`

## Global Constraints

- Every function gets a docstring; every new file gets a top-of-file description comment (CLAUDE.md).
- **No git commits** — this environment has no git identity and changing git config is prohibited. Wherever this plan says "commit", instead re-run the task's tests as a checkpoint and move on.
- Backend tests live in `docs/backend/tests/` and run with `~/venv/bin/python3 -m pytest` from `/workspace`. NEVER use `/workspace/.venv` (owned by the Windows host).
- Frontend commands run from `/workspace/frontend`: `npx vitest run`, `npx tsc -b`, `npm run build`.
- Only `.md`, `.txt`, `.pdf` are ingestible file types.
- Follow existing code style: backend mirrors `config_routes.py` / its tests; frontend mirrors existing hooks (`useFolderConfig`) and presentational components (props-only, hooks own fetch logic).
- Frontend visual work (Tasks 7–9) must invoke the `frontend-design:frontend-design` skill before writing UI code (standing user instruction).
- Theme tokens available: `--color-ion` #6ee7f9, `--color-synapse` #b389ff, `--color-muted` #7c8699, `bg-void`, `.glass-panel`, `shadow-glow-ion/synapse/soft`.

---

### Task 1: Backend — shared switch helper + `GET /api/ingest-status`

**Files:**
- Modify: `backend/api/config_routes.py`
- Test: `docs/backend/tests/api/test_ingest_status_endpoint.py` (create)

**Interfaces:**
- Produces: `config_routes.switch_to_folder(new_path: Path) -> None` (used by Task 3), module state `_current_ingest_thread: threading.Thread | None`, endpoint `GET /api/ingest-status` → `{"ingesting": bool, "path": str}`.

- [ ] **Step 1: Write failing tests** in `docs/backend/tests/api/test_ingest_status_endpoint.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure:** `~/venv/bin/python3 -m pytest docs/backend/tests/api/test_ingest_status_endpoint.py -q` — expect AttributeError/404 failures.

- [ ] **Step 3: Implement in `backend/api/config_routes.py`:**
  - Add `_current_ingest_thread: threading.Thread | None = None` module state (import `threading`).
  - Extract everything in `set_folder_config` after validation into:

```python
def switch_to_folder(new_path: Path) -> None:
    """
    Core folder-switch logic shared by POST /api/folder-config and
    POST /api/ingest/upload: stop the previous watcher, purge the previous
    folder's graph and vector-store data, re-ingest the new folder via
    startup.startup() (recording its reconciliation thread for
    /api/ingest-status), start a fresh watcher, and reset the chat session.
    """
    global _current_folder, _current_watcher, _current_ingest_thread

    if _current_watcher is not None:
        _current_watcher.stop()

    graph_store_path = Path(config.GRAPH_STORE_PATH)
    hash_store_path = Path(config.HASH_STORE_PATH)

    GraphStore().persist(graph_store_path)
    vector_store = VectorStore()
    vector_store.clear_all()

    graph_store, thread = startup.startup(new_path, graph_store_path, hash_store_path, vector_store)
    _current_ingest_thread = thread

    watcher = FolderWatcher(new_path, graph_store, vector_store, hash_store_path)
    watcher.start()
    _current_watcher = watcher

    chat_session.start_new_session(str(new_path))
    _current_folder = str(new_path)
```

  - `set_folder_config` keeps only validation + `switch_to_folder(new_path)` + the same return dict.
  - Add the endpoint:

```python
@router.get("/api/ingest-status")
def get_ingest_status() -> dict:
    """Report whether a folder switch's ingestion/reconciliation thread is still running."""
    ingesting = _current_ingest_thread is not None and _current_ingest_thread.is_alive()
    return {"ingesting": ingesting, "path": _current_folder}
```

- [ ] **Step 4: Verify new + existing tests pass:** `~/venv/bin/python3 -m pytest docs/backend/tests/api/test_ingest_status_endpoint.py docs/backend/tests/api/test_folder_config_endpoint.py -q` — all pass.

---

### Task 2: Backend — `GET /api/browse`

**Files:**
- Create: `backend/api/browse_routes.py`
- Modify: `backend/main.py` (mount router)
- Test: `docs/backend/tests/api/test_browse_endpoint.py` (create)

**Interfaces:**
- Produces: `GET /api/browse?path=<abs>` → `{"path": str, "parent": str | None, "drives": list[str] | None, "dirs": [{"name": str, "path": str}]}`. No `path` param → `Path.home()`. 422 on invalid path.

- [ ] **Step 1: Write failing tests** in `docs/backend/tests/api/test_browse_endpoint.py`:

```python
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
```

- [ ] **Step 2: Verify failure:** `~/venv/bin/python3 -m pytest docs/backend/tests/api/test_browse_endpoint.py -q` — 404s.

- [ ] **Step 3: Implement `backend/api/browse_routes.py`:**

```python
"""
Server-side directory browsing API. Powers the frontend's folder-browser
modal: lists a directory's immediate subdirectories (files excluded,
unreadable entries skipped) with parent navigation and, on Windows, the
available drive roots — the backend can see real absolute paths where the
browser sandbox cannot.
"""
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/api/browse")
def browse(path: str | None = None) -> dict:
    """
    List the immediate subdirectories of `path` (defaulting to the user's
    home directory) as {"name", "path"} entries sorted by name. Includes the
    parent path (null at a filesystem root) and, when the platform supports
    os.listdrives (Windows, Python 3.12+), the list of drive roots. Entries
    that raise OSError (permissions, broken mounts) are skipped. A missing
    or non-directory path returns 422.
    """
    base = Path(path) if path else Path.home()
    if not base.exists() or not base.is_dir():
        raise HTTPException(status_code=422, detail="Path does not exist or is not a directory")

    dirs = []
    try:
        entries = sorted(base.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        raise HTTPException(status_code=422, detail="Directory is not readable")
    for entry in entries:
        try:
            if entry.is_dir():
                dirs.append({"name": entry.name, "path": str(entry)})
        except OSError:
            continue

    parent = None if base.parent == base else str(base.parent)
    drives = list(os.listdrives()) if hasattr(os, "listdrives") else None
    return {"path": str(base), "parent": parent, "drives": drives, "dirs": dirs}
```

  Mount in `backend/main.py` (import `browse_router` and `app.include_router(browse_router)`, matching the existing three routers).

- [ ] **Step 4: Verify pass:** `~/venv/bin/python3 -m pytest docs/backend/tests/api/test_browse_endpoint.py -q` — 5 pass.

---

### Task 3: Backend — `POST /api/ingest/upload` + `UPLOADS_PATH` config + `python-multipart`

**Files:**
- Create: `backend/api/upload_routes.py`
- Modify: `backend/config.py` (add `UPLOADS_PATH`), `backend/main.py` (mount), `requirements.txt` + `pyproject.toml` (add `python-multipart`)
- Test: `docs/backend/tests/api/test_upload_endpoint.py` (create)

**Interfaces:**
- Consumes: `config_routes.switch_to_folder(new_path)` from Task 1.
- Produces: `POST /api/ingest/upload` — multipart with `folder_name` form field + repeated `files` parts whose filenames are folder-relative paths → 200 `{"path": str, "status": "watching", "mode": "uploaded"}`; 422 on empty/unsupported/traversal.

- [ ] **Step 1: Install dep:** add `python-multipart` to `requirements.txt` and `pyproject.toml` dependencies; `VIRTUAL_ENV=$HOME/venv ~/.local/bin/uv pip install python-multipart`.

- [ ] **Step 2: Write failing tests** in `docs/backend/tests/api/test_upload_endpoint.py`:

```python
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
```

- [ ] **Step 3: Verify failure**, then **Step 4: Implement `backend/api/upload_routes.py`:**

```python
"""
Drag-and-drop folder upload API (POST /api/ingest/upload). The browser can
read a dropped folder's files but never its absolute path, so the frontend
uploads the files here; they're saved under UPLOADS_PATH/<folder_name>/
(replacing any previous copy of that folder name) and the shared
folder-switch logic then purges old state and ingests the saved copy. The
live watcher watches the copy — re-dropping the folder is how it refreshes.
"""
import shutil
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile

from backend.api.config_routes import switch_to_folder
from backend.config import UPLOADS_PATH

router = APIRouter()

SUPPORTED_SUFFIXES = {".md", ".txt", ".pdf"}


@router.post("/api/ingest/upload")
def upload_folder(folder_name: str = Form(...), files: list[UploadFile] = None) -> dict:
    """
    Save the uploaded files (multipart parts whose filenames are
    folder-relative paths) under UPLOADS_PATH/<folder_name>/, keeping only
    supported types (.md/.txt/.pdf), then run the shared folder-switch to
    ingest the copy. Rejects path-traversal filenames and uploads with no
    supported files (422 in both cases, nothing switched).
    """
    if not files:
        raise HTTPException(status_code=422, detail="No files uploaded")

    dest_root = (Path(UPLOADS_PATH) / folder_name).resolve()

    saved = []
    for upload in files:
        relative = upload.filename or ""
        if Path(relative).suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        target = (dest_root / relative).resolve()
        if not target.is_relative_to(dest_root):
            raise HTTPException(status_code=422, detail=f"Invalid file path: {relative}")
        saved.append((target, upload))

    if not saved:
        raise HTTPException(status_code=422, detail="No supported files (.md/.txt/.pdf) in upload")

    if dest_root.exists():
        shutil.rmtree(dest_root)
    for target, upload in saved:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(upload.file.read())

    switch_to_folder(dest_root)
    return {"path": str(dest_root), "status": "watching", "mode": "uploaded"}
```

  Add to `backend/config.py`: `UPLOADS_PATH = os.getenv("UPLOADS_PATH", "./uploads")` (next to the other path configs). Mount router in `main.py`. Note: traversal check runs BEFORE any file is written (two-phase: validate all, then write all) — the test for traversal asserts nothing was written.

- [ ] **Step 5: Verify:** `~/venv/bin/python3 -m pytest docs/backend/tests/api/ -q` — all api tests pass. Then full backend suite: `~/venv/bin/python3 -m pytest docs/backend/tests/ -q` — 95+ pass, 1 skip.

---

### Task 4: Frontend — graph-state `generating` flag

**Files:**
- Modify: `frontend/src/state/types.ts`, `frontend/src/state/graphReducer.ts`, `frontend/src/hooks/useFolderSwitch.ts`
- Test: `frontend/tests/unit/reducers.test.ts` (extend), `frontend/tests/integration/useFolderSwitch.test.tsx` (extend)

**Interfaces:**
- Produces: `GraphState.generating: boolean`, actions `{type: "GENERATING_START"} | {type: "GENERATING_END"}`. `useFolderSwitch` dispatches `GENERATING_START` on a genuine folder switch (alongside the existing `RESET_GRAPH`/`RESET_SESSION`).

- [ ] **Step 1: Failing reducer tests** (append to `reducers.test.ts`, follow its existing describe/it style):

```typescript
it("GENERATING_START sets generating and GENERATING_END clears it", () => {
  const started = graphReducer(initialGraphState, { type: "GENERATING_START" });
  expect(started.generating).toBe(true);
  expect(graphReducer(started, { type: "GENERATING_END" }).generating).toBe(false);
});
```

  And in `useFolderSwitch.test.tsx`: a genuine folder switch (path A → path B) dispatches `GENERATING_START` (assert via the graph state exposing `generating: true`), while the initial prefill (null → path) does not.

- [ ] **Step 2: Verify failure:** `npx vitest run tests/unit/reducers.test.ts tests/integration/useFolderSwitch.test.tsx`.

- [ ] **Step 3: Implement:** add `generating: boolean` to `GraphState` (initial `false`), the two actions to `GraphAction`, reducer cases (`GENERATING_START` → `{...state, generating: true}`, `GENERATING_END` → `{...state, generating: false}`; `RESET_GRAPH` must preserve/re-set `generating: true`? No — `RESET_GRAPH` keeps its existing behavior of resetting node/edge/highlight state and should leave `generating` untouched: spread the reset over `{...state}`). In `useFolderSwitch`'s genuine-switch effect, add `dispatchGraph({ type: "GENERATING_START" })` next to `RESET_GRAPH`.

- [ ] **Step 4: Verify pass**, then run the full `npx vitest run` to catch any `GraphState` literal in other tests missing the new field (fix by adding `generating: false`).

---

### Task 5: Frontend — `useGeneratingStatus` poll hook

**Files:**
- Create: `frontend/src/hooks/useGeneratingStatus.ts`
- Test: `frontend/tests/integration/useGeneratingStatus.test.tsx` (create)

**Interfaces:**
- Consumes: `GraphState.generating` + `GENERATING_END` from Task 4.
- Produces: `useGeneratingStatus(): void` — while `generating` is true, polls `GET /api/ingest-status` every 1500ms; when a poll returns `{"ingesting": false}`, dispatches `GENERATING_END` and stops.

- [ ] **Step 1: Failing test** (mirror `useIngestionStatus.test.tsx`'s fake-timers + mocked-fetch pattern): mount a probe component inside the providers that dispatches `GENERATING_START`, mock fetch to return `{ingesting: true}` twice then `{ingesting: false}`; advance timers; assert `generating` flips to false after the third poll and fetch isn't called again afterward. Also: hook never fetches while `generating` is false.

- [ ] **Step 2: Verify failure.**

- [ ] **Step 3: Implement** (pattern-match `useIngestionStatus`):

```typescript
/**
 * While the graph slice's `generating` flag is set (a folder switch/upload
 * kicked off ingestion), polls GET /api/ingest-status and dispatches
 * GENERATING_END once the backend reports the ingestion/reconciliation
 * thread has finished. Real signal, not a node-count heuristic — pairs with
 * the graph viewport's generating overlay.
 */
import { useEffect } from "react";
import { useGraphState } from "../state/providers";

const POLL_INTERVAL_MS = 1500;

/** Polls /api/ingest-status while generating; clears the flag when the backend goes idle. */
export function useGeneratingStatus(): void {
  const { state, dispatch } = useGraphState();
  const generating = state.generating;

  useEffect(() => {
    if (!generating) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/ingest-status");
        if (cancelled || !res.ok) return;
        const body = await res.json();
        if (body.ingesting === false) dispatch({ type: "GENERATING_END" });
      } catch {
        // Transient poll failure: try again next tick.
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [generating, dispatch]);
}
```

- [ ] **Step 4: Verify pass.**

---

### Task 6: Frontend — folder upload plumbing (`uploadFolder` + `useFolderUpload`)

**Files:**
- Create: `frontend/src/lib/folderUpload.ts`, `frontend/src/hooks/useFolderUpload.ts`
- Test: `frontend/tests/unit/folderUpload.test.ts`, `frontend/tests/integration/useFolderUpload.test.tsx` (create both)

**Interfaces:**
- Produces:
  - `collectFilesFromDataTransfer(items: DataTransferItemList): Promise<{file: File, relativePath: string}[]>` — walks `webkitGetAsEntry()` trees recursively; returns [] if nothing is a directory.
  - `collectFilesFromInput(fileList: FileList): {file: File, relativePath: string}[]` — uses each file's `webkitRelativePath`.
  - `filterSupported(entries: {file: File, relativePath: string}[]): {file: File, relativePath: string}[]` — keeps `.md/.txt/.pdf` (case-insensitive).
  - `useFolderUpload(): { uploading: boolean, error: string | null, uploadEntries: (folderName: string, entries: {file: File, relativePath: string}[]) => Promise<void> }` — builds FormData (`folder_name` field; each entry appended as `files` with `relativePath` as the filename), POSTs `/api/ingest/upload`; on success dispatches `RESET_FOLDER` (with returned path) + `STATUS_UPDATE watching` to ingestion state (which makes `useFolderSwitch` fire `RESET_GRAPH`/`RESET_SESSION`/`GENERATING_START` exactly as a browse switch does); on failure sets `error` via the same `extractErrorMessage` shapes as `useFolderConfig`.

- [ ] **Step 1: Failing unit tests** for the pure pieces: `filterSupported` keeps only supported suffixes case-insensitively; `collectFilesFromInput` maps `webkitRelativePath`; `collectFilesFromDataTransfer` with a mocked entry tree (directory entry containing a file entry and a nested directory — mock `webkitGetAsEntry`, `createReader().readEntries(cb)`, `file(cb)`) returns the flattened relative paths, and returns [] for a single-file (non-directory) drop.

- [ ] **Step 2: Failing integration test** for `useFolderUpload`: mocked fetch 200 `{path: "/srv/uploads/notes", status: "watching", mode: "uploaded"}` → ingestion state `folderPath` updates and graph state `generating` becomes true (via the provider tree with `useFolderSwitch` active, mirroring `useFolderSwitch.test.tsx`'s setup); mocked 422 `{detail: "No supported files (.md/.txt/.pdf) in upload"}` → `error` exposes the detail and no state change.

- [ ] **Step 3: Verify failures, then implement.** `folderUpload.ts` (pure, no React):

```typescript
/**
 * Pure helpers for turning a dropped/picked folder into uploadable entries:
 * recursive FileSystemEntry walking (drag-and-drop), webkitRelativePath
 * mapping (folder picker input), and ingestible-type filtering. Network
 * submission lives in useFolderUpload; these stay pure for unit testing.
 */
const SUPPORTED = [".md", ".txt", ".pdf"];

export interface UploadEntry {
  file: File;
  relativePath: string;
}

/** Keeps only entries whose extension is ingestible (.md/.txt/.pdf, case-insensitive). */
export function filterSupported(entries: UploadEntry[]): UploadEntry[] {
  return entries.filter((e) => SUPPORTED.some((s) => e.relativePath.toLowerCase().endsWith(s)));
}

/** Maps a folder-picker FileList (webkitdirectory input) to upload entries via webkitRelativePath. */
export function collectFilesFromInput(fileList: FileList): UploadEntry[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

/** Reads one FileSystemFileEntry as a File (callback API promisified). */
function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Drains a directory reader (readEntries returns batches until empty). */
async function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

/** Recursively flattens a FileSystemEntry tree into upload entries with folder-relative paths. */
async function walkEntry(entry: FileSystemEntry, prefix: string): Promise<UploadEntry[]> {
  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry);
    return [{ file, relativePath: prefix + entry.name }];
  }
  const children = await readAllEntries(entry as FileSystemDirectoryEntry);
  const nested = await Promise.all(children.map((c) => walkEntry(c, `${prefix}${entry.name}/`)));
  return nested.flat();
}

/**
 * Walks dropped DataTransfer items; only directory drops produce entries
 * (a single dropped file returns [], which the drop zone surfaces as a
 * "drop a folder, not a file" hint). Relative paths are rooted INSIDE the
 * dropped folder (the folder's own name is not part of relativePath — it's
 * sent separately as folder_name).
 */
export async function collectFilesFromDataTransfer(items: DataTransferItemList): Promise<{
  folderName: string | null;
  entries: UploadEntry[];
}> {
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const children = await readAllEntries(entry as FileSystemDirectoryEntry);
      const nested = await Promise.all(children.map((c) => walkEntry(c, "")));
      return { folderName: entry.name, entries: nested.flat() };
    }
  }
  return { folderName: null, entries: [] };
}
```

  `useFolderUpload.ts` mirrors `useFolderConfig`'s fetch/error/dispatch structure (reuse its `extractErrorMessage` by exporting it from `useFolderConfig.ts`).

- [ ] **Step 4: Verify all four test files pass.**

---

### Task 7: Frontend — browse modal (INVOKE `frontend-design` SKILL FIRST)

**Files:**
- Create: `frontend/src/hooks/useBrowse.ts`, `frontend/src/components/folder/FolderBrowserModal.tsx`
- Test: `frontend/tests/integration/FolderBrowserModal.test.tsx` (create)

**Interfaces:**
- Consumes: `GET /api/browse` (Task 2 shape), `useFolderConfig().submit` for the final selection.
- Produces: `<FolderBrowserModal open onClose={() => void} onSelect={(path: string) => void} />` — fetches `/api/browse` on open, renders current path, dir list (click → navigate into), Up button (disabled when `parent` null), Home button, drive chips when `drives` non-null, Select button calling `onSelect(currentPath)`.

- [ ] **Step 1: Invoke the `frontend-design:frontend-design` skill** and design the modal within the established neon/glass theme (glass-panel surface, ion accents, mono path readout).
- [ ] **Step 2: Failing tests:** modal fetches home listing on open (mocked fetch), clicking a dir refetches with that path and updates the readout, Up disabled at root, Select fires `onSelect` with the current path, drive chips render when `drives` provided and navigate on click.
- [ ] **Step 3: Implement** `useBrowse` (state: `currentPath`, `parent`, `drives`, `dirs`, `loading`, `navigate(path?)`) + the modal component (presentational, props + hook). Follow `CollapsiblePanel`'s styling conventions and existing test-id patterns (`data-testid="folder-browser-modal"` etc.).
- [ ] **Step 4: Verify pass.**

---

### Task 8: Frontend — folder panel rework (INVOKE `frontend-design` SKILL, continues Task 7's direction)

**Files:**
- Create: `frontend/src/components/folder/FolderDropZone.tsx`, `frontend/src/components/folder/FolderSourceBadge.tsx`
- Modify: `frontend/src/components/folder/FolderPanel.tsx`
- Delete: `frontend/src/components/folder/FolderPathInput.tsx`, `frontend/tests/unit/FolderPathInput.test.tsx`
- Test: `frontend/tests/unit/FolderDropZone.test.tsx` (create), `frontend/tests/integration/FolderPanelRework.test.tsx` (create)

**Interfaces:**
- Consumes: Tasks 6 + 7 (`useFolderUpload`, `collectFilesFromDataTransfer`, `collectFilesFromInput`, `filterSupported`, `FolderBrowserModal`, `useFolderSwitch`).
- Produces: reworked `FolderPanel` — drop zone (drag-over glow state; drop → collect/filter/upload; click → hidden `<input type="file" webkitdirectory>`; single-file drop → inline hint "Drop a folder, not a file"), "Browse server folders…" button opening the modal (Select → `submit(path)` from `useFolderSwitch`), active-source line (folder basename + `FolderSourceBadge` mode: "Linked folder" / "Uploaded copy · re-drop to refresh"), inline error region shared by both flows. Mode is tracked with local `useState<"linked" | "uploaded" | null>` set by whichever flow last succeeded, defaulting to "linked" when the prefill exists.

- [ ] **Step 1: Failing tests:** drop zone renders hint text and reacts to dragover (class/testid state change); dropping a mocked directory DataTransfer calls upload with filtered entries (mock `collectFilesFromDataTransfer` via `vi.mock`); single-file drop shows the hint and never calls upload; Browse button opens the modal; modal Select submits the path through the folder-config flow (mocked fetch) and the badge shows "Linked folder"; after a successful upload the badge shows "Uploaded copy".
- [ ] **Step 2: Implement** (drop zone + badge presentational; FolderPanel wires hooks). Keep `FolderStatusLine` and `useIngestionStatus` exactly as-is.
- [ ] **Step 3: Remove** `FolderPathInput.tsx` + its test file (the ONLY intentional deletions; `useFolderConfig`/`useFolderSwitch` stay — browse still uses them).
- [ ] **Step 4: Full frontend gate:** `npx vitest run` (fix any test referencing the removed input — check `AppShell.test.tsx` and `GlobalStateCrossPanel.test.tsx` for folder-input assumptions), `npx tsc -b`.

---

### Task 9: Frontend — generating overlay on the graph viewport (INVOKE `frontend-design` SKILL, continues direction)

**Files:**
- Create: `frontend/src/components/graph/GeneratingOverlay.tsx`
- Modify: `frontend/src/components/graph/GraphView.tsx` (render overlay as sibling of the canvas, same layer pattern as `NodeDetailOverlay`), `frontend/src/App.tsx` or `GraphView` (call `useGeneratingStatus()` once, at a level that survives panel collapse — inside `GraphView` is fine since the center pane never unmounts)
- Test: `frontend/tests/unit/GeneratingOverlay.test.tsx` (create), extend `frontend/tests/integration/useGeneratingStatus.test.tsx` if overlay-lifecycle assertions fit better there

**Interfaces:**
- Consumes: `GraphState.generating` (Task 4), `useGeneratingStatus` (Task 5), live node count from `GraphState.nodes.length`.
- Produces: `<GeneratingOverlay nodeCount={number} />` rendered only while `generating` — full-viewport pointer-events-none overlay: radial pulse sweep + drifting particles (CSS animations on theme tokens; no new deps), headline "Generating graph", live "`{nodeCount}` concepts discovered" counter (mono font), subtle vignette so fading-in nodes remain visible beneath.

- [ ] **Step 1: Failing tests:** overlay renders with counter text when `generating: true` and node count N; absent when false; counter updates when nodes are added while generating.
- [ ] **Step 2: Implement** overlay + wire into `GraphView` (guarded by `state.generating`; `useGeneratingStatus()` called in `GraphView` body). CSS keyframes go in `index.css` next to existing animation tokens.
- [ ] **Step 3: Verify pass.**

---

### Task 10: Integration gate + docs

**Files:**
- Modify: `docs/frontend/frontend_context.md` (decision entry: folder-selection rework, new endpoints consumed, mode-badge semantics, accepted uploaded-copy tradeoff), `docs/backend/backend_context.md` (new endpoints + UPLOADS_PATH + switch_to_folder refactor entry), `.env.example` (add `UPLOADS_PATH=./uploads`), `.gitignore` (add `uploads/`)

- [ ] **Step 1: Backend gate:** `~/venv/bin/python3 -m pytest docs/backend/tests/ -q` — everything passes (expect ~100 passed, 1 skipped).
- [ ] **Step 2: Frontend gate:** from `/workspace/frontend`: `npx vitest run` (all green), `npx tsc -b` (clean), `npm run build` (clean).
- [ ] **Step 3: Boot check:** start uvicorn with `~/venv/bin/python3 -m uvicorn backend.main:app --port 8000`, `curl localhost:8000/api/browse` and `/api/ingest-status` return 200 JSON; kill server; remove stray runtime artifacts (`git status --porcelain` should show only intended files).
- [ ] **Step 4: Write the doc entries** listed above.

## Self-Review Notes

- Spec coverage: browse endpoint (Task 2), upload + UPLOADS_PATH + traversal guard (Task 3), shared helper + ingest-status (Task 1), panel rework + drop zone + modal + badges (Tasks 7–8), generating flag/poll/overlay (Tasks 4, 5, 9), tests throughout, gate + docs (Task 10). Empty-state hint ("Drop a folder to begin") folds into Task 9's overlay/empty-state work.
- Type consistency: `UploadEntry {file, relativePath}` used consistently in Task 6/8; `switch_to_folder(new_path: Path)` consistent in Tasks 1/3; `GENERATING_START/END` in Tasks 4/5/6/9.
- No git commits anywhere (environment constraint documented in Global Constraints).
