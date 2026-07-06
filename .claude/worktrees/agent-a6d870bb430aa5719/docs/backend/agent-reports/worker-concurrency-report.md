### Status
COMPLETE

### What I Built
All files were authored in my isolated worktree and then copied to their real `/workspace/...` paths via `Bash cp`, each verified with `diff` immediately after copying (all diffs clean, see command output referenced in my work log).

- `backend/concurrency/__init__.py` (new, 9 lines) — re-exports `GRAPH_LOCK`.
- `backend/concurrency/lock.py` (new, 23 lines) — defines `GRAPH_LOCK = threading.Lock()`, with a docstring recording the `threading.Lock` vs `asyncio.Lock` decision.
- `backend/ingestion/watcher.py` (modified, now 169 lines) — added `from backend.concurrency.lock import GRAPH_LOCK`; wrapped the mutating section of `process_file_change` (`pipeline.ingest_file(...)`, `resolver.resolve_all(...)`, hash-store update/persist) in one `with GRAPH_LOCK:` block; wrapped the mutating section of `process_file_deletion` (`graph_store.remove_file(...)`, `vector_store.delete_file(...)`, hash-store update, `graph_store.persist(...)`) in one `with GRAPH_LOCK:` block. No changes to `FolderWatcher` or `startup.py` — the brief explicitly said not to add an outer lock there (would double-acquire non-reentrantly from the same thread).
- `backend/query_service.py` (modified, now 96 lines) — added `from backend.concurrency.lock import GRAPH_LOCK`; wrapped `seeds = seed_from_query(...)` in one `with GRAPH_LOCK:` block, and `traversal = traverse(...)` + `context = _build_context(...)` in a second `with GRAPH_LOCK:` block (see "What the Orchestrator Should Know" for why this is two blocks, not one). The no-match cutoff check, the Haiku relevance double-check, and `generate_answer` are left unlocked, as instructed.
- `docs/backend/tests/unit/test_concurrency.py` (implemented from stub, 138 lines) — 3 tests, no fixtures declared in the stub, built inline fixtures per the brief's latitude.
- `docs/backend/tests/integration/test_concurrency_integration.py` (implemented from stub, 170 lines) — 2 tests, using the stub's declared fixtures plus a small number of additional fixtures (see below).
- `docs/backend/backend_context.md` (appended, new "Round 5b" section) — records the `threading.Lock` decision, lock placement, the two-separate-blocks deviation in `query_service.py`, and the extra test fixtures used.

### Test Results
All run against the real `/workspace` checkout with `/workspace/.venv/bin/python -m pytest`.

Owned tests (`docs/backend/tests/unit/test_concurrency.py docs/backend/tests/integration/test_concurrency_integration.py -v`):
- `test_lock_is_acquired_before_write_and_released_after` — PASS
- `test_query_read_acquires_the_same_lock_briefly` — PASS
- `test_lock_prevents_write_and_read_proceeding_simultaneously` — PASS
- `test_query_during_ingestion_write_never_sees_partial_graph` — PASS
- `test_near_simultaneous_file_change_and_query_do_not_deadlock` — PASS

5/5 passed, 0 failed.

Round 4/5a regression scope (`test_incremental_ingestion.py test_rag_query_pipeline.py test_websocket_traversal_stream.py -v`):
16/16 passed, 0 failed (all previously-passing tests still pass — the lock additions did not change behavior for any of these).

### What the Orchestrator Should Know
- **Deviation in `query_service.py`'s lock shape:** the brief asked for `seeds = seed_from_query(...)`, `traversal = traverse(...)`, and `context = _build_context(...)` to be wrapped in "a single `with GRAPH_LOCK:` block," but also explicitly said the no-match cutoff check must NOT be inside the lock. In the existing code, the cutoff check sits between the seeding line and the traversal line (it's what decides whether to short-circuit before traversal runs at all) — so those three lines can't be made contiguous without either locking the cutoff check too (contradicts the brief) or moving the cutoff check after traversal (which would defeat its purpose as a fast pre-filter and waste a full traversal on obvious no-match queries). I implemented this as two separate `with GRAPH_LOCK:` blocks — one around seeding, one around traversal+context-building — using the same lock object, acquired sequentially and never nested. This satisfies the substance of the instruction (guard only the graph/vector-touching lines, exclude the cutoff check and LLM calls) without restructuring the function's existing short-circuit control flow. Recorded in `backend_context.md`.
- **Extra test fixtures beyond the stub-declared list:** `test_query_during_ingestion_write_never_sees_partial_graph` uses `monkeypatch`/`tmp_path` (pytest builtins) in addition to the stub's `sample_graph`/`chroma_test_client`/`mock_extraction_llm`. `test_near_simultaneous_file_change_and_query_do_not_deadlock` uses `mock_embedding_client`, `mock_traversal_llm`, `mock_haiku_client`, and `monkeypatch` in addition to the stub's `tmp_watch_folder`/`mock_extraction_llm`/`chroma_test_client`. This was necessary because that test drives the real (unfaked) `process_file_change` + `answer_query` end-to-end, and several code paths it touches aren't defensively wrapped against network failures — notably `entity_resolution/resolver.py::resolve_embedding_tier` calls `openrouter_client.embed_text` with no try/except at all, and `anthropic_client.judge_relevance` also has no try/except. Without mocking these, the test would attempt real network calls in this sandboxed environment (slow/flaky/likely to fail outright). All fixtures used are pre-existing ones already defined in `docs/backend/tests/conftest.py` from earlier rounds — no new fixtures were added.
- Both integration tests capture any exception raised inside their background threads into an `errors` list and assert it's empty, so a silent in-thread failure can't be mistaken for a passing "no deadlock" result.
- No changes were made to `backend/api/`, `backend/chat_session/`, `backend/no_match_detection/`, or `backend/entity_resolution/`, per the brief's "What NOT to build" list.

### What the Next Worker Needs
`backend.concurrency.lock.GRAPH_LOCK` (a `threading.Lock`) is now importable and already wired into both write entry points (`backend/ingestion/watcher.py::process_file_change`/`process_file_deletion`) and the read entry point (`backend/query_service.py::answer_query`). Any future code that directly mutates or reads `graph_store`/`vector_store` outside these three functions should acquire `GRAPH_LOCK` itself around that access — it is not automatically applied anywhere else (e.g. if a future endpoint reads `graph_store.graph` directly rather than going through `answer_query`).

### Blockers
None. All dependency files (`backend/ingestion/watcher.py`, `backend/query_service.py`, and their test stubs) existed and were non-empty when I started.
