### Status
COMPLETE

### What I Built
- `backend/api/config_routes.py` (81 lines, new file) — `GET /api/folder-config` and `POST /api/folder-config`, module-level `_current_folder`/`_current_watcher` state, per the brief's exact 8-step POST flow (validate path → stop old watcher → fresh `GraphStore()`/`VectorStore()` → `startup.startup()` → new `FolderWatcher().start()` → `chat_session.start_new_session()` → update state → return `200`).
- `backend/main.py` (14 lines total) — targeted `Edit` (not a whole-file rewrite) adding exactly two lines: the `config_router` import and its `include_router` call. No WS router was present in the file at the time of my edit, so there was nothing else to preserve; if `worker-ws-streaming`'s addition lands after mine, it should merge in alongside without conflict since I only anchored on the `graph_router` lines.
- `docs/backend/tests/api/test_folder_config_endpoint.py` (151 lines) — updated `FOLDER_CONFIG_ENDPOINT` to `/api/folder-config`, removed the `@pytest.mark.skip` marker from the shape test, implemented all 4 previously-stubbed tests plus the shape test's body, and added a local `autouse` fixture (`_reset_folder_config_state`) that resets `config_routes._current_folder`/`_current_watcher` before and after every test in this file (best-effort `.stop()` on any leftover watcher, wrapped in `try/except` since a watcher whose `.start()` was mocked in `test_submitting_new_folder_path_tears_down_and_restarts_watcher` was never actually started, so a real `.stop()`/`.join()` on it during teardown can raise).

**Environment note:** this worktree (`/workspace/.claude/worktrees/agent-a882a657eea04630f`) had no `backend/` or populated `docs/backend/` at all — Rounds 1-4's code exists only as untracked files in the main `/workspace` checkout, and git worktrees don't share untracked files. Per the harness's instruction to edit the worktree copy rather than the shared-checkout path, I copied `/workspace/backend`, `/workspace/docs/backend`, `/workspace/requirements.txt`, and `/workspace/.env` into this worktree before starting, then built everything against that copy. Tests were run using `/workspace/.venv/bin/python -m pytest` (the shared venv already has all dependencies installed; this worktree has no venv of its own).

### Test Results
Ran `pytest docs/backend/tests/api/test_folder_config_endpoint.py -v` — all 5 pass:
- `test_first_load_reflects_watch_folder_as_default` — PASS
- `test_submitting_new_folder_path_tears_down_and_restarts_watcher` — PASS
- `test_submitting_new_folder_path_resets_chat_session` — PASS
- `test_submitting_invalid_folder_path_returns_error_without_crashing` — PASS
- `test_folder_config_request_response_shape_matches_finalized_contract` (unskipped) — PASS

```
5 passed, 1 warning in 47.13s
```
(The one warning is an unrelated pre-existing `httpx`/starlette deprecation notice from `fastapi.testclient`, not something introduced by this work.)

### What the Orchestrator Should Know
- **Judgment call on "fresh graph_store/vector_store per folder switch"** (brief step 3, flagged as a judgment call to record): implemented as — build a fresh `GraphStore()` and immediately `.persist()` it to `config.GRAPH_STORE_PATH`, overwriting whatever the previous folder had persisted there, *before* calling `startup.startup()`. This is necessary because `startup.startup()` internally calls `load_persisted_graph(graph_store_path)`, which would otherwise load the *previous* folder's on-disk graph rather than a clean one. Persisting an empty `GraphStore()` first ensures `startup()`'s `load_persisted_graph()` picks up a genuinely empty graph, then `diff_scan` populates it from the new folder. `VectorStore()` is rebuilt as a fresh Python wrapper instance, but it points at the same `CHROMA_DB_PATH` collection as before (there's no "clear the collection" primitive in `VectorStore`, and the brief didn't ask me to add one) — so old embeddings from a previous folder are not purged from Chroma on a folder switch. I did not add a deletion/clearing step since it wasn't specified in the brief's numbered steps and would be scope creep; flagging it here since it's a real behavioral gap (stale embeddings from a prior folder could still surface in retrieval after a switch) that the orchestrator may want a future issue for.
- The brief's numbered POST steps don't mention resetting/clearing `hash_store.json` on a folder switch (only `backend_context.md` decision #6's higher-level summary mentions "old watcher/hash-store/session" teardown). I followed the brief's literal numbered steps, which only call for stopping the old watcher, not clearing the hash store file. Practical effect: if the new folder happens to reuse file paths that were also present in the previous folder's hash store, `diff_scan` would treat them as unchanged and skip re-ingestion. Given the tests' `tmp_path` folders never collide with real paths, this had no observable effect in the test suite, but noting it as a possible gap for the orchestrator to reconcile between the brief and decision #6.
- No fixture changes were needed in the shared `docs/backend/tests/conftest.py` — `fastapi_test_client` was already implemented and sufficient.

### What the Next Worker Needs
- `backend/api/config_routes.py` exposes `router` (a `fastapi.APIRouter`) mounted at `/api/folder-config` (`GET`/`POST`), plus module-level `_current_folder: str` and `_current_watcher: FolderWatcher | None` if any other module needs to introspect the active folder/watcher (none currently do, per the brief's scope).
- `backend/main.py` now has both `graph_router` and `config_router` mounted. `worker-ws-streaming` should add its own router alongside these via a small anchored `Edit`, not a rewrite.

### Blockers
None. No dependency files were missing — `FolderWatcher`, `startup.startup`, `chat_session.start_new_session`, `config`, and `VectorStore` all existed and matched the brief's described signatures exactly once the worktree was populated with Rounds 1-4's code.
