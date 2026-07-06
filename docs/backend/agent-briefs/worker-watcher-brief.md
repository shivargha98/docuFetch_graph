# Worker Brief: Folder Watcher + Deletion Cleanup + Startup Reconciliation (Issues 6, 7, 8)

## Context
Rounds 1-3 are complete and verified in `/workspace/backend/`. You're building three new files under `backend/ingestion/` (`hash_store.py`, `watcher.py`, `startup.py`). You're running in parallel this round with `worker-no-match-chat` (Issues 12/13) — they build `backend/no_match_detection/`, `backend/chat_session/`, and modify `backend/query_service.py` plus `backend/clients/anthropic_client.py`. **You touch none of those files, and they touch none of yours** — this round has no shared-file risk between the two workers (unlike Round 3's `openrouter_client.py` near-miss). You also don't need any new `conftest.py` fixtures — every fixture your tests need (`tmp_watch_folder`, `sample_markdown_file`, `mock_extraction_llm`, `chroma_test_client`) already exists and is correct, so you can write conftest.py-independent code without touching that file at all.

Read first: `/workspace/docs/backend/issues.md` (Issues 6, 7, 8), `/workspace/docs/backend/features.md` ("Ingestion" module, "Folder Watcher & Incremental Change Detection" and "Startup Load-Then-Diff-Scan" features), `/workspace/docs/backend/backend_context.md` (full), then the actual current code:
- `/workspace/backend/ingestion/pipeline.py` — `ingest_file(path, graph_store, vector_store=None) -> IngestResult`. Call this per-file; don't reimplement load/chunk/extract.
- `/workspace/backend/graph_store/store.py` — `GraphStore.remove_file(source_file: str)` (already exists, removes nodes/edges solely attributable to that file), `GraphStore.persist(path)`, `GraphStore.load(path)`.
- `/workspace/backend/vector_store/store.py` — `VectorStore.delete_file(source_file: str)` (already exists).
- `/workspace/backend/entity_resolution/resolver.py` — `resolve_all(graph_store, merge_threshold=..., ambiguous_low=...) -> None` (already exists, Round 3). Call this after ingesting a batch of files (cross-file dedup), not per-chunk.
- `/workspace/backend/config.py` — `GRAPH_STORE_PATH` (default `./graph_store.json`), `HASH_STORE_PATH` (default `./hash_store.json`), `WATCH_FOLDER`.

## What to build

### 1. `backend/ingestion/hash_store.py`
- `compute_file_hash(path: Path) -> str` — sha256 hex digest of the file's bytes.
- `load_hash_store(path: Path) -> dict[str, str]` — JSON dict of `{absolute_file_path: hash}`; return `{}` if the file doesn't exist (first-ever run, per Issue 8 criterion 5 — must not raise).
- `save_hash_store(hashes: dict[str, str], path: Path) -> None` — write JSON, creating parent dirs if needed (same pattern as `GraphStore.persist`).

### 2. `backend/ingestion/watcher.py`
- `process_file_change(path: Path, graph_store, vector_store, hash_store_path: Path) -> bool` — compute the file's current hash, compare against `load_hash_store(hash_store_path)`. If unchanged, return `False` (skip — no re-extraction, per Issue 6 criterion 2). If new or changed: call `pipeline.ingest_file(path, graph_store, vector_store=vector_store)`, then `entity_resolution.resolver.resolve_all(graph_store)` (cross-file resolution after every ingest, since a new/changed file may introduce a duplicate of an existing concept), update the hash store with the new hash and persist it via `save_hash_store`, return `True`.
- `process_file_deletion(path: Path, graph_store, vector_store, hash_store_path: Path) -> None` — call `graph_store.remove_file(str(path))`, `vector_store.delete_file(str(path))`, remove the path's entry from the loaded hash store and persist it, then `graph_store.persist(Path(GRAPH_STORE_PATH))`.
- `class FolderWatcher` wrapping `watchdog.observers.Observer` + a `watchdog.events.FileSystemEventHandler` subclass, watching a folder for create/modify/delete events on files:
  - Constructor: `FolderWatcher(watch_folder: Path, graph_store, vector_store, hash_store_path: Path, debounce_seconds: float = 0.5)`. Make `debounce_seconds` a real constructor parameter (not a hardcoded module constant) so tests can inject a tiny value (e.g. `0.05`) instead of waiting through a slow real debounce window.
  - **Debouncing (Issue 6 criterion 4):** on each create/modify event for a given path, (re)start a `threading.Timer(debounce_seconds, callback)` keyed by that path — a new event for the same path before the timer fires cancels and restarts it, so rapid successive saves collapse into exactly one call to `process_file_change` once the file goes quiet for `debounce_seconds`.
  - On a delete event, call `process_file_deletion` directly (no debounce needed for deletes — a file can't be "rapidly deleted" the way saves can).
  - `start()` / `stop()` methods around the underlying `Observer`.
  - Unsupported extensions are already handled gracefully inside `pipeline.ingest_file` (returns `skipped=True`) — no special-casing needed in the watcher itself.

### 3. `backend/ingestion/startup.py`
- `load_persisted_graph(graph_store_path: Path) -> GraphStore` — `GraphStore.load(graph_store_path)` if the file exists, else a fresh empty `GraphStore()`. Must not raise if no prior state exists (Issue 8 criterion 5).
- `diff_scan(watch_folder: Path, graph_store: GraphStore, vector_store, hash_store_path: Path) -> None` — reconcile the watched folder against the loaded hash store in one synchronous pass: for every file currently in `watch_folder`, call `process_file_change` (handles both "new" and "changed" cases, and correctly no-ops on unchanged files via the hash comparison); for every path present in the hash store but no longer present on disk, call `process_file_deletion`. This is the function Issue 8's "background scan" runs — keep it synchronous and directly callable/joinable, so callers (including tests) can deterministically wait for it to finish rather than sleeping.
- `startup(watch_folder: Path, graph_store_path: Path, hash_store_path: Path, vector_store) -> tuple[GraphStore, threading.Thread]` — calls `load_persisted_graph` (instant, returns immediately with the previously-persisted graph usable right away, satisfying Issue 8 criterion 1), then spawns `diff_scan` in a background `threading.Thread(daemon=True)` and starts it, returning `(graph_store, thread)`. Callers (tests, and later the FastAPI app's startup event) can inspect `graph_store` immediately and separately `thread.join()` to wait for the reconciliation to finish deterministically — this is what lets a test assert "graph available before scan completes" without flaky timing (check state right after `startup()` returns, then `.join()` and re-check).

## Tests you own
Run `pytest docs/backend/tests/integration/test_incremental_ingestion.py -v` — all 6 tests are yours:
- `test_adding_file_triggers_ingestion_for_that_file_only`
- `test_unchanged_file_resave_does_not_trigger_reextraction`
- `test_rapid_successive_saves_are_debounced_into_one_ingestion_pass` — use a small injected `debounce_seconds` (e.g. `0.05`) and a `time.sleep` slightly longer than that in the test, not a long real-time wait.
- `test_deleting_watched_file_cleans_up_graph_and_vector_store`
- `test_startup_loads_persisted_graph_immediately_then_reconciles_offline_changes` — simulate "offline changes" by manipulating files/hash-store directly (not via a running watcher), then call `startup()` and use the returned thread's `.join()` to assert reconciliation completed.
- `test_first_ever_startup_with_no_prior_state_performs_full_ingestion`

No new conftest.py fixtures needed for these — the brief's "Context" section confirms everything you need already exists.

## What NOT to build
- No modification to `backend/query_service.py`, `backend/no_match_detection/`, `backend/chat_session/`, `backend/clients/anthropic_client.py` — not your files this round (the other Round 4 worker owns them).
- No FastAPI wiring (mounting `startup()` on the app's actual startup event) — that's Round 5's `worker-folder-config` job. You just need `startup()` to be a plain, testable Python function.
- No polling-based watcher fallback — `watchdog`'s native OS-level file system events are sufficient (personal, local, single-user tool).

## Gotchas
- Add `watchdog` to `requirements.txt` (append, don't rewrite the existing lines — check what's there first).
- `entity_resolution.resolver.resolve_all` does O(n²) pairwise comparison across ALL current nodes every time it's called — for a personal-scale tool this is fine per CLAUDE.md's simplicity-first rule, but don't call it more than once per file-change event (i.e., call it once after `pipeline.ingest_file` succeeds, not per-chunk).
- `hash_store.py`'s dict keys should be the same string form used elsewhere for `source_file` (check `graph_store.remove_file`/`vector_store.delete_file`'s existing calls in tests to confirm — they use `str(path)`, i.e. the plain string form of a `Path`, not `path.resolve()` unless that's already the established convention; match whatever `pipeline.ingest_file`/`chunk.source_file` already produce so hash-store keys line up with graph/vector-store file references).

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-watcher-report.md`:
- Files created: `backend/ingestion/hash_store.py`, `watcher.py`, `startup.py`.
- Exact pytest results for your 6 owned tests.
- Confirm `requirements.txt`'s new `watchdog` line and that you did not touch any file owned by `worker-no-match-chat`.
- Your debounce mechanism's exact behavior and the `debounce_seconds` default/test value used.
- Any deviation and why.

Run the tests before reporting done.
