# Worker Brief: WebSocket Traversal Streaming (Issue 14)

## Context
Rounds 1-4 are complete and verified in `/workspace/backend/`. You're building `backend/api/ws_routes.py` and making two small, backward-compatible additions to existing files: `backend/retrieval/traversal.py` (add an optional callback param) and `backend/query_service.py` (thread that callback through). You're running in parallel this round with `worker-folder-config` (Issue 15) — they build `backend/api/config_routes.py`. **You both need to add one line to `backend/main.py`** (mounting your router) — see the explicit anti-clobbering instruction below, this is the only shared-file risk this round.

Read first: `/workspace/docs/backend/issues.md` (Issue 14), `/workspace/docs/backend/features.md` ("WS" module), `/workspace/docs/backend/backend_context.md` (full — decision #5 "WebSocket message schema" is your exact, already-decided contract), then the actual current code:
- `/workspace/backend/retrieval/traversal.py` — `traverse(graph_store, seed_node_ids, query, max_hops=3, max_nodes=15) -> list[dict]`. Internally has a `_visit(node_id, hop, via_relation) -> bool` closure that appends to `steps` and a main loop that calls it for seeds and for each subsequent hop's chosen next-node.
- `/workspace/backend/query_service.py` — `answer_query(query, graph_store, vector_store, folder_path="default", cutoff=None) -> dict`. Calls `traverse(...)` internally, then `_build_context`, then no-match checks, then `generate_answer`.
- `/workspace/backend/api/graph_routes.py` (Issue 16) — study this file's pattern closely: it does `import backend.config as config` (not `from backend.config import GRAPH_STORE_PATH`) specifically so tests can monkeypatch `config.GRAPH_STORE_PATH` at request time and the route picks up the patched value. **You must follow this exact same pattern** for your WS route's graph loading.
- `/workspace/backend/main.py` — currently `app = FastAPI()` plus one `app.include_router(graph_router)` line (Issue 16). You add a second `include_router` line for your WS router.

## What to build

### 1. Extend `backend/retrieval/traversal.py::traverse` with an optional callback (backward compatible)
Add `on_visit: Callable[[dict], None] | None = None` as a new keyword parameter, default `None`. Inside the existing `_visit` closure, right after a step is successfully appended to `steps`, call `on_visit(steps[-1])` if `on_visit is not None`. This lets a caller observe each step **as it happens**, not just get the final list back — required for genuine live streaming (Issue 14 criterion 1: "one streamed event per visited node/edge... not a single batched dump at the end"). Do not change the function's return value or any existing behavior when `on_visit` is not passed — Round 3's and Round 4's existing passing tests call `traverse(...)` without this parameter and must be unaffected.

### 2. Extend `backend/query_service.py::answer_query` with the same optional callback (backward compatible)
Add `on_visit: Callable[[dict], None] | None = None` as a new keyword parameter, default `None`, and pass it straight through to your call to `traverse(...)`. No other change to `answer_query`'s logic, signature order, or return shape. Existing 3-arg and 4-arg calls from Round 3/4's tests are unaffected since this is an additional trailing keyword-only-in-practice parameter with a default.

### 3. `backend/api/ws_routes.py`
A FastAPI `APIRouter` with `@router.websocket("/ws/chat")`. Per connection:
- Loop: `await websocket.receive_json()` expecting `{"query": "<text>"}`.
- Load the current graph fresh, same pattern as `graph_routes.py`: `import backend.config as config` then `GraphStore.load(Path(config.GRAPH_STORE_PATH))` if the file exists else `GraphStore()`. Construct a `VectorStore()` the same way (default path from `config.CHROMA_DB_PATH`).
- Run `answer_query(...)` with `on_visit` wired to stream events **live**, not after the fact. Since `answer_query`/`traverse` are synchronous functions and a WebSocket send is async, bridge them like this: run `answer_query` in a background thread via `await asyncio.to_thread(...)`, with `on_visit` set to a small function that does `loop.call_soon_threadsafe(queue.put_nowait, step)` (capture `loop = asyncio.get_running_loop()` before starting the thread; `queue = asyncio.Queue()`). Concurrently, `await`-loop pulling from `queue` and sending each step as a `visit_node` event over the websocket, until the background thread's `asyncio.to_thread` call completes (use `asyncio.gather` or a sentinel value pushed onto the queue when the thread finishes, whichever is simpler for you to get right — a sentinel `None` pushed in a `finally` block around the `to_thread` call is a reliable pattern).
- Event schema (from backend_context.md decision #5 — implement exactly):
  - Per step: `{"type": "visit_node", "node_id": step["node_id"], "concept": step["concept"], "hop": step["hop"], "via_relation": step["via_relation"]}`.
  - After all steps: `{"type": "traversal_complete", "nodes_visited": len(traversal), "hops_used": max((s["hop"] for s in traversal), default=0)}`.
  - Then exactly one of: `{"type": "answer", "text": result["answer"]}` (when `result["no_match"]` is `False`) or `{"type": "no_match", "message": result["answer"]}` (when `True` — recall `no_match_detection.NOT_FOUND_MESSAGE` is already what `answer_query` puts in `result["answer"]` for a no-match).
  - On any exception during the whole flow: `{"type": "error", "message": str(exception)}`, then continue the outer loop (don't close the connection on one bad query).
- `folder_path` for `answer_query`: use a fixed default (e.g. `"default"`) for now — Round 5's other worker (Issue 15) owns real per-folder tracking; you don't need to coordinate the actual active folder path here, just don't hardcode something that breaks `answer_query`'s own default.

### 4. Mount your router in `backend/main.py`
**Anti-clobbering instruction (critical):** `worker-folder-config` is ALSO adding one line to this exact file in parallel. Do NOT read the whole file and rewrite it. Instead, use the `Edit` tool with a small, targeted, anchored replacement — read the file fresh immediately before your edit, find the existing `app.include_router(graph_router)` line (or whatever is there at the time), and insert your new `from backend.api.ws_routes import router as ws_router` import + `app.include_router(ws_router)` line via a minimal `Edit` (old_string/new_string) that only touches those 1-2 lines, not the whole file. If, when you're about to finish, you notice the file already has a folder-config router mounted that you don't recognize from your own edit, **do not remove it** — that's the other worker's legitimate addition; just add yours alongside it.

## Tests you own
Run `pytest docs/backend/tests/api/test_websocket_traversal_stream.py -v` — all 4 non-skipped tests are yours (the 5th, schema-completeness, is now actually decided — see below).

You need to implement `ws_test_client` in `docs/backend/tests/conftest.py` (still `raise NotImplementedError`) — it depends on `fastapi_test_client` (already implemented): `from starlette.testclient import TestClient` already backs `fastapi_test_client`; Starlette's `TestClient` supports `.websocket_connect(path)` as a context manager yielding an object with `.send_json(...)`/`.receive_json()`. Implement `ws_test_client(fastapi_test_client)` returning `fastapi_test_client` itself (tests can call `ws_test_client.websocket_connect("/ws/chat")` directly), OR return a small wrapper — your call, whichever is simplest to use from your own test bodies. **You are the only Round 5 worker touching `conftest.py` this round if `worker-folder-config` needs no new fixtures (check their brief — they use only `fastapi_test_client`, already implemented) — safe to write this fixture back directly, no serial merge needed.**

Since these tests don't include a `chroma_test_client`/`mock_embedding_client` fixture, write your test bodies to `monkeypatch` `backend.retrieval.seed.seed_from_query` directly (e.g. `monkeypatch.setattr("backend.retrieval.seed.seed_from_query", lambda query, vector_store, top_k=5: [{"node_id": "concept_machine_learning", "score": 0.0}])`) so you don't need a real Chroma instance — combine this with monkeypatching `config.GRAPH_STORE_PATH` to a tmp path where you've persisted `sample_graph` (same pattern as `test_graph_read_endpoint.py`), plus `mock_traversal_llm`/`mock_haiku_client` (already-implemented fixtures) to drive a deterministic multi-hop traversal and answer.

Also handle the now-resolved open question: **remove the `@pytest.mark.skip` marker from `test_full_ws_message_schema_matches_finalized_contract`** and implement it against the finalized schema above (backend_context.md decision #5) — assert every event type (`visit_node`, `traversal_complete`, `answer` or `no_match`, and trigger an `error` case too, e.g. by making `mock_traversal_llm` raise inside a hop).

## What NOT to build
- No reconnection/heartbeat/ping logic — not asked for.
- No multi-client broadcast — one query per connection, straightforward request/response-per-message over the socket.
- Don't touch `backend/api/config_routes.py`, `backend/chat_session/`, `backend/no_match_detection/`, `backend/ingestion/watcher.py` — not your files this round.
- No changes to `traverse`'s or `answer_query`'s existing required parameters or return shape — purely additive.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-ws-streaming-report.md`:
- Files created/changed: `backend/api/ws_routes.py`, the two additive changes to `traversal.py`/`query_service.py`, `main.py`'s one added import+include_router line, `conftest.py`'s `ws_test_client`.
- Exact pytest results for your 5 owned tests (4 + the now-unskipped schema test).
- Confirm Round 3/4's existing tests calling `traverse(...)`/`answer_query(...)` without `on_visit` still pass unchanged (re-run at least `test_retrieval.py` and `test_rag_query_pipeline.py`).
- The exact final state of the two lines you added to `main.py`, and confirm you used a targeted Edit, not a whole-file rewrite.
- Any deviation and why.

Run the tests before reporting done.
