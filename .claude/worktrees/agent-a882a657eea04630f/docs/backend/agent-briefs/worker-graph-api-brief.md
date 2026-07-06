# Worker Brief: Graph Read API (Issue 16)

## Context
Round 1 (Issue 1) is complete and merged into `/workspace/backend/`. You are building a new `backend/api/` module and adding the FastAPI app's first route. You're running in parallel this round with `worker-file-formats` (Issue 2) and `worker-vector-store` (Issue 3) — neither touches `backend/main.py` or creates `backend/api/`, so you have no file overlap with them this round.

Read first: `/workspace/docs/backend/issues.md` (Issue 16), `/workspace/docs/backend/features.md` ("API" module, "Graph Read Endpoint" feature), `/workspace/docs/backend/backend_context.md` (full — decision #6 "API endpoint shapes" is your resolved contract), then the actual current code:
- `/workspace/backend/main.py` — currently just `app = FastAPI()`, no routes. **Important naming note already recorded in `backend_context.md`:** the FastAPI app object lives at `backend/main.py`, NOT `backend/api/main.py` (orchestrator_plan.md's architecture table said the latter, but Round 1's brief overrode it — follow what actually exists).
- `/workspace/backend/config.py` — has `GRAPH_STORE_PATH` (default `./graph_store.json`).
- `/workspace/backend/graph_store/store.py` — `GraphStore.load(path) -> GraphStore` classmethod; graph nodes have `id`, `name`, `description`, `source_files`; edges (via `self.graph.edges(data=True)`) carry a `relation` attribute.

## What to build (Issue 16 exactly, per the ALREADY-DECIDED endpoint shape in backend_context.md decision #6)

1. **`backend/api/__init__.py`, `backend/api/graph_routes.py`** — a FastAPI `APIRouter` with `GET /api/graph` that:
   - Loads the current graph via `GraphStore.load(Path(GRAPH_STORE_PATH))` **fresh on every request** (no caching, no persistent in-memory graph instance yet — that comes later when Issue 6/8's watcher owns a long-lived `GraphStore` object; for now, stateless load-per-request is correct and simplest per CLAUDE.md).
   - If the file at `GRAPH_STORE_PATH` doesn't exist yet (no ingestion has run), catch `FileNotFoundError` and return `{"nodes": [], "edges": []}` with a normal 200 — NOT an error.
   - Otherwise, build the response: `{"nodes": [{"id": n["id"], "name": n["name"], "description": n["description"], "source_files": n["source_files"]} for each node], "edges": [{"source": u, "target": v, "relation": data["relation"]} for each edge (u, v, data) in graph.edges(data=True)]}`.
2. **Mount it in `backend/main.py`:** add `from backend.api.graph_routes import router as graph_router` and `app.include_router(graph_router)`. This is the only edit to `main.py` this round.

### conftest.py fixture you must implement
- `fastapi_test_client` — `from fastapi.testclient import TestClient; from backend.main import app; return TestClient(app)`. Keep it simple — no dependency overrides needed for this round since the endpoint reads straight from `GRAPH_STORE_PATH`.

**Important test-design note:** `test_graph_read_endpoint.py`'s tests use a `sample_graph` fixture (already implemented by Round 1 in `conftest.py` — a 3-node/2-edge graph spanning two files) alongside `fastapi_test_client`. Since your endpoint reads from `GRAPH_STORE_PATH` on disk, the tests need `sample_graph` persisted to whatever path the endpoint will read. The cleanest way: in each test body, call `monkeypatch.setattr("backend.config.GRAPH_STORE_PATH", str(tmp_path / "graph_store.json"))` **before** persisting `sample_graph` to that same path and **before** calling the endpoint — but note `backend/api/graph_routes.py` must read `config.GRAPH_STORE_PATH` at request time (import the module and reference `config.GRAPH_STORE_PATH`, not `from backend.config import GRAPH_STORE_PATH` which would bind the value at import time and make it unpatchable). Use `import backend.config as config` and reference `config.GRAPH_STORE_PATH` inside the route handler.

## Tests you own
Run `pytest docs/backend/tests/api/test_graph_read_endpoint.py -v`. All 4 tests are yours:
- `test_graph_read_returns_all_current_nodes_and_edges`
- `test_each_returned_edge_includes_relation_type_label`
- `test_graph_read_before_ingestion_returns_empty_graph_not_error`
- `test_graph_read_response_shape_matches_finalized_contract` — currently `@pytest.mark.skip`-marked pending the shape decision. **The shape IS now decided (backend_context.md decision #6) — remove the `@pytest.mark.skip` marker and write a real assertion against the contract above.**

Also update the placeholder constant at the top of the test file: `GRAPH_READ_ENDPOINT = "/graph"` → `GRAPH_READ_ENDPOINT = "/api/graph"` (matches the decided path).

Do NOT touch `loaders.py`, `chunking.py`, `pipeline.py`, `vector_store/` — not your files this round.

## What NOT to build
- No pagination — explicitly decided against for v1 in `backend_context.md` decision #6 (personal single-user tool, small graphs).
- No filtering/query params on this endpoint — not asked for by any acceptance criterion.
- No auth/rate-limiting — out of scope for this personal tool.

## Gotchas
- `GraphStore.load` will raise if the JSON file is malformed, but that's not a scenario any test exercises — only handle the "file doesn't exist" case explicitly (per the acceptance criterion "before any ingestion has completed").
- Remember the `config.GRAPH_STORE_PATH` (module-attribute access, not a bound import) pattern above — it's the difference between your tests being able to monkeypatch the path or not.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-graph-api-report.md`:
- Files created/changed: `backend/api/__init__.py`, `backend/api/graph_routes.py`, `backend/main.py` (the one-line router mount), `conftest.py` (`fastapi_test_client`), `test_graph_read_endpoint.py` (constant + un-skip).
- Exact pytest results for your 4 owned tests — all should pass.
- Confirm you did not implement `ws_test_client`, `mock_traversal_llm`, `mock_haiku_client`, `entity_resolution_thresholds`, `no_match_cutoff` fixtures (other rounds' scope).
- Any deviation and why.

Run the tests before reporting done.
