# Worker Brief: Folder Configuration API (Issue 15)

## Context
Rounds 1-4 are complete and verified in `/workspace/backend/`. You're building `backend/api/config_routes.py`. You're running in parallel this round with `worker-ws-streaming` (Issue 14) — they build `backend/api/ws_routes.py` and touch `retrieval/traversal.py`/`query_service.py` additively. **You both need to add one line to `backend/main.py`** — see the explicit anti-clobbering instruction below, the only shared-file risk this round. You need no new `conftest.py` fixtures (only `fastapi_test_client`, already implemented), so there's no fixture-merge risk on your side.

Read first: `/workspace/docs/backend/issues.md` (Issue 15), `/workspace/docs/backend/features.md` ("API" module, "Folder Configuration Endpoint" feature), `/workspace/docs/backend/backend_context.md` (full — decision #6 "API endpoint shapes" gives you the exact, already-decided `/api/folder-config` contract), then the actual current code:
- `/workspace/backend/ingestion/watcher.py` (Round 4) — `FolderWatcher(watch_folder, graph_store, vector_store, hash_store_path, debounce_seconds=0.5)`, with `.start()`/`.stop()`.
- `/workspace/backend/ingestion/startup.py` (Round 4) — `load_persisted_graph(graph_store_path) -> GraphStore`, `startup(watch_folder, graph_store_path, hash_store_path, vector_store) -> tuple[GraphStore, threading.Thread]`.
- `/workspace/backend/chat_session/session.py` (Round 4) — `start_new_session(folder_path: str) -> ChatSession` (force-creates a fresh session; use this on every folder switch, per its own docstring: "for explicit resets... even a no-op switch to the same path").
- `/workspace/backend/config.py` — `WATCH_FOLDER`, `GRAPH_STORE_PATH`, `HASH_STORE_PATH`, `CHROMA_DB_PATH`.
- `/workspace/backend/vector_store/store.py` — `VectorStore(path: str | None = None)`.
- `/workspace/backend/main.py` — currently `app = FastAPI()` plus one `app.include_router(graph_router)` line.

## What to build

### `backend/api/config_routes.py`
Module-level mutable state (this module owns the single "active folder" concept for the whole running app — nothing else needs to track it):
```python
_current_folder: str = WATCH_FOLDER  # default from .env on first import
_current_watcher: FolderWatcher | None = None
```
- `GET /api/folder-config` → `{"path": _current_folder}`. On the very first call (no watcher started yet), this just reflects the `.env` default — no side effects needed for a GET.
- `POST /api/folder-config` with body `{"path": "<new absolute folder path>"}`:
  1. Validate: does `Path(new_path)` exist and is it a directory? If not: return `422` with `{"detail": "<reason, e.g. 'Path does not exist' or 'Path is not a directory'>"}` — **do not raise an unhandled exception; use FastAPI's `HTTPException(status_code=422, detail=...)`** so the backend keeps serving other requests normally (Issue 15 criterion 4).
  2. If valid: if `_current_watcher` is not `None`, call `_current_watcher.stop()` (tears down the old watcher, Issue 15 criterion 2).
  3. Build a fresh `GraphStore()` and `VectorStore()` for the new folder (per the PRD's "starts fresh ones scoped to the new path" — this is a personal single-user tool with one active folder at a time, so "fresh" here means a clean slate for the new path, not preserving multiple historical folders' graphs simultaneously; note this interpretation explicitly in your report since it's a judgment call, not explicitly spelled out).
  4. Run ingestion for the new folder: call `startup.startup(Path(new_path), Path(GRAPH_STORE_PATH), Path(HASH_STORE_PATH), vector_store)` (loads-then-diff-scans — reuses Round 4's exact machinery rather than writing a new ingestion loop) to get the (graph_store, thread) pair; you don't need to block on the thread for the HTTP response to return (the PRD's own startup design is "available immediately, background reconciles").
  5. Start a new `FolderWatcher(Path(new_path), graph_store, vector_store, Path(HASH_STORE_PATH))` and call `.start()`; store it as `_current_watcher`.
  6. Call `chat_session.start_new_session(new_path)` (Issue 15 criterion 3 — fresh session, no carried-over history).
  7. Update `_current_folder = new_path`.
  8. Return `200 {"path": new_path, "status": "watching"}`.

### Mount your router in `backend/main.py`
**Anti-clobbering instruction (critical):** `worker-ws-streaming` is ALSO adding one line to this exact file in parallel. Do NOT read the whole file and rewrite it. Instead, use the `Edit` tool with a small, targeted, anchored replacement — read the file fresh immediately before your edit, find the existing `app.include_router(graph_router)` line (or whatever is there at the time), and insert your new `from backend.api.config_routes import router as config_router` import + `app.include_router(config_router)` line via a minimal `Edit` (old_string/new_string) that only touches those 1-2 lines, not the whole file. If, when you're about to finish, you notice the file already has a WS router mounted that you don't recognize from your own edit, **do not remove it** — that's the other worker's legitimate addition; just add yours alongside it.

## Tests you own
Run `pytest docs/backend/tests/api/test_folder_config_endpoint.py -v` — all 4 non-skipped tests are yours:
- `test_first_load_reflects_watch_folder_as_default` — needs no folder switch, just `GET` and check it reflects `.env`'s `WATCH_FOLDER`.
- `test_submitting_new_folder_path_tears_down_and_restarts_watcher(tmp_path)` — `POST` to a valid `tmp_path` directory, then assert something observable changed (e.g. `_current_watcher` is a new instance, or the folder-config `GET` now reflects the new path). Since directly asserting "old watcher stopped" is hard to observe externally, a reasonable approach: patch/spy `FolderWatcher.stop`/`FolderWatcher.start` (e.g. via `unittest.mock.patch.object`) to confirm `stop()` was called on the old instance and `start()` on the new one across two successive `POST`s.
- `test_submitting_new_folder_path_resets_chat_session(tmp_path)` — establish a turn via `chat_session.add_turn(chat_session.get_or_create_session(...), ...)` for folder A, `POST` a switch to a new `tmp_path` folder B, then assert `chat_session.get_history(chat_session.get_or_create_session(new_path))` is empty.
- `test_submitting_invalid_folder_path_returns_error_without_crashing` — `POST` a nonexistent path, assert `4xx`, then make a subsequent normal `GET` request and confirm the backend still responds normally (proves it didn't crash).

Also handle the now-resolved open question: update the placeholder constant at the top of the test file from `FOLDER_CONFIG_ENDPOINT = "/config/folder"` to `FOLDER_CONFIG_ENDPOINT = "/api/folder-config"` (matches backend_context.md decision #6), **remove the `@pytest.mark.skip` marker** from `test_folder_config_request_response_shape_matches_finalized_contract`, and implement it against the finalized `GET`/`POST` request/response shapes in decision #6.

**Gotcha — test isolation:** since `_current_folder`/`_current_watcher` are process-level module state, your tests will affect each other's starting state if run in sequence within the same test session. Use a `conftest`-free, in-test fixture (e.g. a local `autouse` fixture in your own test file, or explicit setup/teardown in each test function) to reset `config_routes._current_folder`/`_current_watcher` between tests — don't rely on writing this into the shared `conftest.py` if you can keep it local to `test_folder_config_endpoint.py`'s own file (simplest way to avoid needing to touch the shared fixture file at all this round).

## What NOT to build
- No support for multiple simultaneously-tracked folders/history — single active folder, matches the PRD.
- Don't touch `backend/api/ws_routes.py`, `backend/retrieval/`, `backend/no_match_detection/` — not your files this round.
- No new persistence format for "last selected folder across restarts" — not asked for; `.env`'s `WATCH_FOLDER` remains the only default-on-first-load source.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-folder-config-report.md`:
- Files created/changed: `backend/api/config_routes.py`, `main.py`'s one added import+include_router line, the test file's constant/skip-marker changes.
- Exact pytest results for your 4 + 1 (now-unskipped) = 5 owned tests.
- The exact final state of the two lines you added to `main.py`, and confirm you used a targeted Edit, not a whole-file rewrite.
- Your judgment call on "fresh graph_store/vector_store per folder switch" (recorded above) — confirm you implemented it as described or note any deviation.
- Any deviation and why.

Run the tests before reporting done.
