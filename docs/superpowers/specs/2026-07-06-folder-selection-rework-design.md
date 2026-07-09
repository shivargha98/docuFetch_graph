# Folder Selection Rework + Graph Generation Animation — Design

Date: 2026-07-06. Approved by user in-session.

## Goal

Remove the absolute-path text input from the folder panel. Replace it with two selection mechanisms — a server-side directory browser (keeps live watching) and drag-and-drop folder upload (ingests a managed copy) — and show a "graph is generating" animation on the graph box while ingestion runs.

## Why both mechanisms

Browsers never expose a dropped/picked folder's absolute path, only its contents. The backend's watchdog needs a real path. So:
- **Browse (linked folder):** backend lists real directories; selecting one keeps the existing live-watch behavior intact.
- **Drop/pick (uploaded copy):** files are uploaded and saved under a managed folder; the watcher watches the copy. Edits to the originals don't sync — the user re-drops to refresh. User explicitly accepted this tradeoff.

## Backend changes

### 1. `GET /api/browse?path=<abs path>` (new, in `backend/api/browse_routes.py`)
- Returns `{"path": str, "parent": str|null, "drives": [str]|null, "dirs": [{"name": str, "path": str}]}`.
- No `path` param → starts at `Path.home()`.
- `dirs` lists immediate subdirectories only (no files); entries raising `PermissionError`/`OSError` are skipped silently.
- `parent` is `str(path.parent)` or null when at a filesystem root (`path.parent == path`).
- `drives` populated on Windows via `os.listdrives()` when available (`hasattr` guard — backend may run on Windows host or Linux container), else null.
- Invalid/non-directory path → 422 with detail (same convention as folder-config).

### 2. `POST /api/ingest/upload` (new, in `backend/api/upload_routes.py`)
- Multipart form: repeated `files` parts; each part's filename carries the folder-relative path (e.g. `notes/topic.md`). A `folder_name` form field names the dropped folder.
- Only `.md`, `.txt`, `.pdf` files are saved; anything else ignored server-side (frontend also pre-filters).
- Saves to `UPLOADS_PATH/<folder_name>/` (new config: `UPLOADS_PATH`, env-overridable, default `./uploads`). An existing copy of the same folder name is deleted first (fresh replace).
- Path traversal guard: each saved file's resolved path must stay under `UPLOADS_PATH/<folder_name>/`; offending parts are rejected with 422.
- Then runs the shared folder-switch logic (below) on the saved copy. Returns `{"path": str, "status": "watching", "mode": "uploaded"}`.
- Empty upload (no supported files) → 422, no switch happens.

### 3. Shared switch helper (refactor in `backend/api/config_routes.py`)
- Extract the body of `set_folder_config` into `switch_to_folder(new_path: Path) -> None`: stop old watcher, persist fresh GraphStore, `VectorStore().clear_all()`, `startup.startup(...)`, start new watcher, reset chat session, update module state.
- Additionally store the startup reconciliation thread in module state (`_current_ingest_thread`) — it's already returned by `startup.startup()` and currently discarded.
- `POST /api/folder-config` behavior/response is unchanged (its response keeps no `mode` field; adding one is not needed by the frontend).

### 4. `GET /api/ingest-status` (new, lives with config_routes)
- Returns `{"ingesting": bool, "path": str}` — `ingesting` is `_current_ingest_thread is not None and _current_ingest_thread.is_alive()`.
- This is a real signal (the reconciliation thread is what performs ingestion after a switch), not a heuristic.

## Frontend changes

### 5. Folder panel rework (`FolderPanel` and children)
- Remove the path text input and its submit flow.
- Add a **drop zone**: full-width, shows "Drop a folder here — or click to pick one"; drag-over state glows (design under `frontend-design` skill). Click opens a hidden `<input type="file" webkitdirectory>`.
- On drop: walk `DataTransferItem.webkitGetAsEntry()` recursively; on pick: use the input's `files` (each has `webkitRelativePath`). Filter to `.md/.txt/.pdf`, build `FormData`, POST to `/api/ingest/upload`. A dropped single file (not a folder) shows an inline hint instead of uploading.
- Add a **"Browse server folders…"** button opening the browser modal: fetches `/api/browse`, renders dir list + parent/home/drives navigation, **Select** button POSTs the chosen path to `/api/folder-config`.
- Active-source display: folder name + mode badge — "Linked folder" (browse path) vs "Uploaded copy" (upload path) with a short "re-drop to refresh" hint for uploads.
- Errors (422s, empty/no-supported-files folder) render inline in the panel, existing pattern.

### 6. Generating animation (graph box)
- New `generating` flag in the graph state slice. Set when a switch/upload POST succeeds; cleared when `/api/ingest-status` reports `ingesting: false` (polled alongside the existing graph poll).
- While generating: futuristic scanning overlay on the graph viewport (exact treatment chosen under the `frontend-design` skill; direction: radial pulse sweep + particle drift + live "N concepts discovered" counter fed by the node count from the graph poll). Nodes keep fading in live underneath, as already built.
- Empty state (no folder yet) points at the panel: "Drop a folder to begin."

## Testing

- **Backend (pytest, in `docs/backend/tests/api/`):** browse — lists dirs only, skips unreadable, parent null at root, 422 on bad path; upload — saves filtered files under UPLOADS_PATH, replaces prior copy, rejects traversal + empty uploads, triggers switch (mocked watcher/startup, existing fixture patterns); ingest-status — reflects thread liveness.
- **Frontend (Vitest/RTL, in `frontend/tests/`):** drop zone renders/uploads with mocked entries + fetch; modal navigation against mocked `/api/browse`; generating flag lifecycle (set on switch, cleared on idle status); no-match of removed path-input tests updated.
- **Gate:** full backend pytest suite, full Vitest suite, `tsc -b`, `npm run build` all green.

## Out of scope

- Live syncing of dropped folders (accepted tradeoff; re-drop to refresh).
- Upload size limits/streaming for very large folders (personal tool; revisit if it bites).
- Auth/multi-user concerns on browse/upload endpoints (single-user local app).
