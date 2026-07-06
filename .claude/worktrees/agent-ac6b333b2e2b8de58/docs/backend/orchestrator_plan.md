# Backend Orchestrator Plan — docuFetch Graph

_Living document. Updated as rounds progress._

## Dependency graph (from issues.md)

```
1 (foundation: load->chunk->extract->persist, single md file)
├── 2 (extend loaders/chunking: txt/pdf/paragraph-fallback)      [needs 1]
├── 3 (Chroma embedding, hooks pipeline)                          [needs 1]
├── 4 (entity resolution: string tier)                            [needs 1]
├── 16 (graph read API)                                           [needs 1]
├── 9 (vector-seeded lookup)                                       [needs 3]
5 (entity resolution: embedding+LLM tiers)                        [needs 3, 4]
10 (bounded LLM-guided traversal)                                  [needs 9]
11 (Haiku answer end-to-end)                                       [needs 10]
6 (watcher + hash diff)                                             [needs 1, 3]
7 (deletion cleanup)                                                [needs 6]
8 (startup load-then-diff)                                          [needs 6, 7]
12 (no-match cutoff + double-check)                                 [needs 11]
13 (chat session, 5-turn window)                                    [needs 11]
14 (WS traversal streaming)                                         [needs 10, 11]
15 (folder config API)                                              [needs 6, 13]
17 (concurrency lock guarding)                                      [needs 6, 9]
```

Two mostly-independent chains emerge after Issue 1 (+3):
- **Chain A (ingestion/watcher):** 2, 3, 4 → 5 → 6 → 7 → 8, 16
- **Chain B (retrieval/chat):** 9 → 10 → 11 → 12, 13 → 14

They only re-converge at Issues 15 and 17 (folder config needs the watcher *and* chat session; concurrency needs the watcher *and* retrieval).

## Build order (rounds)

| Round | Issues | Workers | Parallel? | Rationale |
|---|---|---|---|---|
| 1 | 1 | worker-foundation | solo | Everything else depends on this. Establishes module skeleton, client interfaces, pipeline orchestrator. |
| 2 | 2, 3, 16 | worker-file-formats, worker-vector-store, worker-graph-api | parallel (3) | All depend only on Issue 1. File-format extension touches only `loaders.py`/`chunking.py`. Vector store is a new module + one hook line in `pipeline.py`. Graph API is a new module reading `graph_store.py` read-only. No two workers touch the same file this round. |
| 3 | 4+5 (combined), 9+10+11 (combined) | worker-entity-resolution, worker-retrieval-answer | parallel (2) | Entity resolution touches `pipeline.py` (post-extraction hook) + new `entity_resolution/` module; needs round 2's vector store for tier 2. Retrieval+traversal+answer is a new `retrieval/` + `answer_generation/` module family plus a new `query_service.py` orchestrator — does not touch `pipeline.py` at all. Safe parallel pair. Issues 4/5 and 9/10/11 are each combined into one worker because they are tightly sequential extensions of the same code (5 literally extends 4's pipeline; 10 needs 9's seeds, 11 needs 10's traversal) — splitting them into separate round-trips would add integration overhead without reducing risk. |
| 4 | 6+7+8 (combined), 12+13 (combined) | worker-watcher, worker-no-match-chat | parallel (2) | Watcher chain touches new `ingestion/watcher.py` + `hash_store.py`, and calls existing `graph_store`/`vector_store` delete methods (additive). No-match+chat touches `query_service.py` (adds cutoff short-circuit + session context injection) + two new modules. No file overlap between the two workers. |
| 5 | 14, 15, 17 | worker-ws-streaming, worker-folder-config, worker-concurrency | parallel (3) | WS adds a new `api/ws_routes.py` router; folder-config adds a new `api/config_routes.py` router (each included into `main.py` via one line — trivial to merge); concurrency wraps existing `graph_store`/`vector_store` methods with a lock (needs round 4's watcher + round 3's retrieval to exist as the two callers to guard between). |
| 6 | — | worker-integration | solo | Final wiring: confirm all routers mounted on one FastAPI app, run full `pytest docs/backend/tests/`, fix any integration seams, mark SHIPPED. |

## Shared architecture decided up front (so parallel workers don't collide)

Round 1 establishes these; later workers build on top rather than renegotiating:
- `backend/config.py` — loads `.env` via `python-dotenv`/`pydantic-settings`; exposes `WATCH_FOLDER`, `CHROMA_DB_PATH`, `HASH_STORE_PATH`, `OPENROUTER_API_KEY`, `OPENROUTER_LLM_MODEL`, `OPENROUTER_EMBED_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, plus the new tunable constants (thresholds/cutoffs, see decisions log).
- `backend/clients/openrouter_client.py` — `extract_concepts(chunk_text) -> dict`, `embed_text(text) -> list[float]`, `traversal_next_hop(node, neighbors, query) -> dict`. All three are OpenRouter calls but logically distinct roles per PRD.
- `backend/clients/anthropic_client.py` — `generate_answer(context, query, history) -> str`, `judge_relevance(context, query) -> bool`.
- `backend/ingestion/loaders.py`, `backend/ingestion/chunking.py`, `backend/ingestion/pipeline.py` (orchestrator: `ingest_file(path) -> IngestResult`).
- `backend/extraction/extractor.py`, `backend/graph_store/store.py` (`GraphStore` class: `add_concepts`, `merge_nodes`, `remove_file`, `persist`, `load`).
- `backend/vector_store/store.py` (`VectorStore` class, round 2).
- `backend/entity_resolution/resolver.py` (round 3).
- `backend/retrieval/seed.py`, `backend/retrieval/traversal.py`, `backend/answer_generation/answer.py`, `backend/query_service.py` (round 3).
- `backend/ingestion/watcher.py`, `backend/ingestion/hash_store.py` (round 4).
- `backend/no_match_detection/detector.py`, `backend/chat_session/session.py` (round 4).
- `backend/api/main.py` (FastAPI app, round 2 creates it), `backend/api/graph_routes.py` (round 2), `backend/api/ws_routes.py` (round 5), `backend/api/config_routes.py` (round 5).
- `backend/concurrency/lock.py` (round 5).

## Six open questions — resolved (see backend_context.md for full rationale)

1. Chroma schema (Issue 3): metadata fields `chunk_id`, `source_file`, `graph_node_ids` (JSON-encoded list string), `section`.
2. Entity resolution thresholds (Issue 5): merge >= 0.90, ambiguous band [0.75, 0.90), below 0.75 no merge. Configurable constants.
3. No-match cutoff (Issue 12): 0.35 cosine similarity. Configurable constant.
4. Chat persistence (Issue 13): confirmed in-memory only, final decision (not revisited) — the `xfail` test becomes a normal passing test.
5. WS schema (Issue 14): `visit_node`, `traversal_complete`, `answer`, `no_match`, `error` event types — full shapes in backend_context.md.
6. API shapes (Issues 15/16): `GET/POST /api/folder-config`, `GET /api/graph` (no pagination — small personal-use graphs).

## Risk notes

- **Shared-file conflicts:** `pipeline.py` and `query_service.py` are the two hot files. Only one worker per round touches each. Tracked explicitly per round above.
- **External API cost/flakiness:** all unit/integration tests use mocked LLM/embedding clients per conftest.py fixtures — workers must implement fixtures to mock, never call real OpenRouter/Anthropic APIs in tests.
- **PDF library choice:** not pinned by any doc — worker for Issue 1/2 must pick one (e.g. `pypdf`) and record it in backend_context.md.
- **Chroma + networkx + fastapi + watchdog + pypdf + anthropic + openai(-compatible) SDK** all need adding to `requirements.txt` — Round 1 worker owns the initial file; later workers append only what they need.
