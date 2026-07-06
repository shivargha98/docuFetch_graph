# Worker Brief: Concurrency Lock Guarding (Issue 17)

## Context
Rounds 1-5a are complete and verified in `/workspace/backend/`. You are the SOLO worker this round (deliberately sequenced, not parallelized, since you need to wrap the final, settled state of `query_service.py` and `watcher.py` that Round 4/5a just produced). You're building `backend/concurrency/lock.py` and making small, surgical additions to two existing files: `backend/ingestion/watcher.py` and `backend/query_service.py`.

**Read `/workspace/docs/backend/backend_context.md`'s new "Standing operating procedure" note (near the top, added after Round 4/5) before starting** — it explains that Write/Edit tools will refuse paths outside your pinned worktree, forcing you to use Bash `cp` to place finished files at the real `/workspace/...` paths. Do this yourself before finishing (don't just leave work in your worktree) — copy every file you create/modify to its real `/workspace` path, and write your report to the real `/workspace/docs/backend/agent-reports/worker-concurrency-report.md` path too, not just your worktree's copy. Verify each copy landed correctly (e.g. `diff` the worktree and `/workspace` copies) before reporting done.

Read first: `/workspace/docs/backend/issues.md` (Issue 17), `/workspace/docs/backend/features.md` ("Concurrency" module), `/workspace/docs/backend/backend_context.md` (full — the PRD's original decision said "asyncio.Lock (or reader-writer lock)"; you have latitude to choose the right primitive for our actual threading model — see below), then the actual current code:
- `/workspace/backend/ingestion/watcher.py` — `process_file_change(path, graph_store, vector_store, hash_store_path) -> bool` and `process_file_deletion(path, graph_store, vector_store, hash_store_path) -> None`. These are the two "write" entry points — called directly by tests, by `FolderWatcher`'s debounced timer callback (running on a real OS thread via `watchdog`'s `Observer`), and by `startup.diff_scan` (also called from a background `threading.Thread`, see `startup.py`'s `startup()` function).
- `/workspace/backend/query_service.py` — `answer_query(query, graph_store, vector_store, folder_path="default", cutoff=None, on_visit=None) -> dict`. The "read" entry point. Note it's called both synchronously (by tests and any direct caller) and via `asyncio.to_thread(...)` from `backend/api/ws_routes.py` (Issue 14) — i.e., always on a real OS thread one way or another, never natively inside `asyncio`'s single-threaded event loop.

## Choice of lock primitive (make this decision, record it in backend_context.md)
The PRD's original wording says "a simple `asyncio.Lock` (or reader-writer lock)". **Our actual runtime never has two coroutines racing inside the same asyncio event loop over this state** — the watcher runs on real `threading`/`watchdog` OS threads, and the WS route explicitly runs `answer_query` via `asyncio.to_thread` (also a real OS thread from a thread pool). An `asyncio.Lock` would not actually guard these threads against each other (it's only safe to await from within one event loop). **Use a plain `threading.Lock` instead** — this is the correct, simpler primitive for our actual concurrency model, and the PRD's own parenthetical ("or reader-writer lock") explicitly allows deviating from the literal suggestion. Document this reasoning as a decision in `backend_context.md` (new entry, don't rewrite existing ones).

## What to build

### 1. `backend/concurrency/__init__.py`, `backend/concurrency/lock.py`
- `GRAPH_LOCK = threading.Lock()` — a single module-level lock instance guarding all graph_store + vector_store access, imported by both `watcher.py` (writes) and `query_service.py` (reads). One shared lock (not a true reader-writer lock with concurrent readers) is the simplest correct choice for a single-user personal tool per the PRD's own stated rationale ("far less complexity than debounced batch ingestion with atomic state swaps... brief lock contention is a non-issue").

### 2. Wrap the write paths in `backend/ingestion/watcher.py`
In `process_file_change`, wrap the section that mutates state — `pipeline.ingest_file(...)`, `resolver.resolve_all(...)`, and the hash-store update/persist — in `with GRAPH_LOCK:`. Do the same in `process_file_deletion` around `graph_store.remove_file(...)`, `vector_store.delete_file(...)`, the hash-store update, and `graph_store.persist(...)`. Since the lock lives inside these two functions (not at each call site), `FolderWatcher`'s debounce callback and `startup.diff_scan` (which calls these same two functions per file) are automatically guarded without needing separate changes there — do not add a second, outer lock acquisition in `startup.py` (that would double-acquire a non-reentrant lock from the SAME thread if `diff_scan` itself also tried to hold the lock across its whole loop — avoid this deadlock risk; only lock inside the two `watcher.py` functions themselves, once per file, which is already fine-grained enough).

### 3. Wrap the read path in `backend/query_service.py::answer_query`
Wrap only the portion that actually touches `graph_store`/`vector_store` — `seeds = seed_from_query(...)`, `traversal = traverse(...)`, and `context = _build_context(...)` — in a single `with GRAPH_LOCK:` block. Do NOT wrap the no-match cutoff check, the Haiku relevance double-check, or `generate_answer` inside the lock — those don't touch shared graph/vector state, and holding the lock across LLM network calls would create unnecessary contention with no correctness benefit (matches CLAUDE.md's simplicity-first: guard only what needs guarding).

## Tests you own
Run `pytest docs/backend/tests/unit/test_concurrency.py docs/backend/tests/integration/test_concurrency_integration.py -v` — all 5 tests are yours (3 unit + 2 integration), and none of them depend on the API/router layer (no `fastapi_test_client`/`ws_test_client` needed) — they exercise `GRAPH_LOCK` and the watcher/query_service functions directly.

You have design latitude for the unit tests (`test_concurrency.py` — no fixtures declared in the stubs at all):
- `test_lock_is_acquired_before_write_and_released_after` — e.g. spy on `GRAPH_LOCK.acquire`/`release` (or check `GRAPH_LOCK.locked()` mid-call via a controlled delay) while calling `process_file_change`/`process_file_deletion` with minimal fixtures you construct inline (a real temp file + `GraphStore()` + a stub/mock `vector_store`).
- `test_query_read_acquires_the_same_lock_briefly` — same idea around `answer_query`.
- `test_lock_prevents_write_and_read_proceeding_simultaneously` — hold `GRAPH_LOCK` manually in the main thread, start a second thread calling `process_file_change` (or `answer_query`), assert it blocks until you release, using a small timeout-bounded `thread.join(timeout=...)` check (don't let a bug hang the test suite forever — always bound waits).

For the integration tests:
- `test_query_during_ingestion_write_never_sees_partial_graph` — introduce a controlled delay inside one write path (e.g. monkeypatch `graph_store.persist` or `pipeline.ingest_file` to `time.sleep(...)` briefly before returning) so a concurrently-started read has a real window to race against, then assert the read only ever observes a fully-consistent pre- or post-write graph (e.g. by checking node counts are never a partial/torn state).
- `test_near_simultaneous_file_change_and_query_do_not_deadlock` — run both from separate threads with a bounded overall timeout (e.g. `thread.join(timeout=5)` for each, then assert both threads have actually finished, not just that the timeout elapsed) — this is the deadlock-safety check.

## What NOT to build
- No reader-writer lock allowing concurrent reads (a single mutual-exclusion lock is the simplest correct choice per the PRD's own stated rationale) — don't over-engineer this.
- Don't touch `backend/api/`, `backend/chat_session/`, `backend/no_match_detection/`, `backend/entity_resolution/` — not your files this round.
- No lock timeout/retry logic — a personal single-user tool doesn't need it; brief blocking is fine (matches PRD decision #12 in backend_context.md).

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-concurrency-report.md` (at the REAL `/workspace` path, not just your worktree — see the standing operating procedure note above):
- Files created/changed: `backend/concurrency/lock.py`, the two edits to `watcher.py`, the one edit to `query_service.py`.
- Exact pytest results for your 5 owned tests.
- Confirm you re-ran the full Round 4/5a regression scope (`test_incremental_ingestion.py`, `test_rag_query_pipeline.py`, `test_websocket_traversal_stream.py`) and all still pass — your changes touch files those tests exercise heavily.
- Your `threading.Lock` vs `asyncio.Lock` decision, confirmed added to `backend_context.md` as a new entry.
- Any deviation and why.

Run the tests before reporting done, and remember to copy everything to the real `/workspace` paths before finishing.
