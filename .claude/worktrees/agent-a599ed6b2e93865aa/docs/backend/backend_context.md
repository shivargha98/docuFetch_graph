# Backend Context / Decisions Log

_Owned by the orchestrator. Append-only history of decisions, deviations, and resolved ambiguities. Read this before starting any new round._

## 2026-07-05 — Orchestration kickoff

Read (in order): `.claude/CLAUDE.md`, `docs/backend/grill_doc_roadmap.md`, `docs/backend/prd.md`, `docs/backend/features.md`, `docs/backend/issues.md`, `docs/backend/tests.md`, `docs/backend/tests/conftest.py` + sample test files, `docs/backend/context.md`, `docs/backend/tasks.md`. Confirmed `backend/` does not exist yet (blank slate) and `requirements.txt` is empty. `.env` already populated with real-looking keys — treated as untouched/do-not-overwrite; only `CHROMA_DB_PATH` and `HASH_STORE_PATH` will be appended since `.env.example` shows them as expected and they're just path config, not secrets.

Full plan written to `docs/backend/orchestrator_plan.md`. Six rounds planned; two mostly-independent chains (ingestion/watcher vs retrieval/chat) run in parallel after Issue 1.

**Deviation from strict "one worker per issue":** Issues 4+5, 9+10+11, and 6+7+8, 12+13 are each combined into a single worker brief per round because they are tightly sequential extensions of the same code path (each later issue directly extends the file(s) the earlier issue in its pair/triple just created). Splitting them into separate round-trips would add pure integration overhead without reducing risk, since no other worker touches those files in between. Each worker still reports status per individual issue number in its report.

## Six previously-open questions — resolved now (concrete decisions workers must implement against)

### 1. Chroma collection schema (Issue 3)
**Decision:** One Chroma collection (`docufetch_chunks`). Document ID = `chunk_id` (uuid4 str, generated at chunk time). Metadata dict per entry:
- `source_file` (str, absolute path)
- `chunk_id` (str, same as doc id, kept in metadata too for convenience)
- `section` (str, heading/section title, empty string if paragraph-fallback)
- `graph_node_ids` (str, JSON-encoded list of node id strings that this chunk's extraction produced, e.g. `'["concept_ab12", "concept_cd34"]'`) — Chroma metadata values must be scalar (str/int/float/bool), so a list is JSON-encoded into a string field rather than stored natively. Traceability test must `json.loads()` this field to check membership.
**Why:** Simplest scheme that satisfies the "traceable back to graph node id(s)" acceptance criterion without inventing a second store. Deletion-by-file uses a `where={"source_file": path}` filter.

### 2. Entity-resolution thresholds (Issue 5)
**Decision:** cosine similarity `merge_threshold = 0.90` (>= auto-merge, no LLM call), `ambiguous_low = 0.75` (>= 0.75 and < 0.90 triggers LLM adjudication), below 0.75 = no merge, no LLM call. Exposed as constants in `backend/config.py` (`ENTITY_RESOLUTION_MERGE_THRESHOLD`, `ENTITY_RESOLUTION_AMBIGUOUS_LOW`), overridable via env vars for future tuning, and must be accepted as constructor/function params so tests can inject other values per the `entity_resolution_thresholds` fixture contract.
**Why:** Placeholder-but-reasoned values (0.90 exact-synonym-grade similarity, 0.75 floor for "plausibly related but let the LLM decide") — explicitly flagged in code comments as pending empirical tuning against a real corpus, per the PRD's own caveat.

### 3. No-match similarity cutoff (Issue 12)
**Decision:** cosine similarity cutoff `NO_MATCH_SIMILARITY_CUTOFF = 0.35`. All top-k Chroma results below this score short-circuits before traversal. Configurable constant in `backend/config.py`, passed as a parameter (not hardcoded) so the `no_match_cutoff` fixture can inject other values in tests.
**Why:** Low bar deliberately — this is the "obviously nothing relevant" fast-fail; the Haiku double-check (feature 2 of Issue 12) is the real relevance judge for borderline cases.

### 4. Chat session persistence across restart (Issue 13)
**Decision:** CONFIRMED as final: in-memory only, process-global dict keyed by folder path, `ChatSession` holding a `collections.deque(maxlen=5)` of Q&A turns. No disk persistence. This is not a placeholder pending revisit — it is the shipped behavior.
**Why:** Matches PRD's stated default; no user story requires surviving a restart, and adding persistence would need session serialization design not otherwise motivated. **Action for Issue 13 worker:** the `test_session_state_does_not_survive_backend_restart` test in `tests/unit/test_chat_session.py` is currently `xfail`-marked as "pending decision" — remove the `xfail` marker and let it pass as a normal test, and update its docstring to note the decision is final (cite this context.md entry), rather than leaving it flagged as pending.

### 5. WebSocket message schema (Issue 14)
**Decision:** Full event-type contract:
- Client → server (on connect or per message): `{"query": "<user question text>"}`
- Server → client, one per traversal step: `{"type": "visit_node", "node_id": "<id>", "concept": "<name>", "hop": <int>, "via_relation": "<relation label>|null"}` (`via_relation` null only for the seed/hop-0 node).
- Server → client, exactly once per query after all visit_node events: `{"type": "traversal_complete", "nodes_visited": <int>, "hops_used": <int>}`
- Server → client, exactly once after traversal_complete: either `{"type": "answer", "text": "<4-5 line answer>"}` or `{"type": "no_match", "message": "No relevant document found."}`
- Server → client, at any point on failure: `{"type": "error", "message": "<human-readable error>"}` (connection stays open for the next query unless the error is fatal).
**Why:** Extends the PRD's illustrative sketch (`visit_node`/hop) to a complete, closed set of event types covering completion, answer, no-match, and error — the four cases the acceptance criteria + tests require. **Action for Issue 14 worker:** implement this schema, then remove the `skip` marker from `test_full_ws_message_schema_matches_finalized_contract` in `tests/api/test_websocket_traversal_stream.py` and write its body against this contract.

### 6. API endpoint shapes (Issues 15/16)
**Decision:**
- `GET /api/folder-config` → `{"path": "<current watched folder, absolute>"}`. On first call with no prior selection, returns `WATCH_FOLDER` from `.env`.
- `POST /api/folder-config` body `{"path": "<new absolute folder path>"}` → `200 {"path": "<new path>", "status": "watching"}` on success; `422` (or `400`) with `{"detail": "<reason>"}` if the path doesn't exist or isn't a directory. Tears down old watcher/hash-store/session, starts fresh ones.
- `GET /api/graph` → `{"nodes": [{"id": "...", "name": "...", "description": "...", "source_files": ["..."]}], "edges": [{"source": "...", "target": "...", "relation": "..."}]}`. No pagination in v1 — this is a personal single-user tool with graphs expected to stay small; explicitly decided NOT to build pagination now. Empty graph → `{"nodes": [], "edges": []}` with 200.
**Why:** Smallest contract that satisfies all four Issue-15 criteria and three Issue-16 criteria without inventing unused flexibility (matches CLAUDE.md's "simplicity first" rule). **Action for Issue 15/16 workers:** remove the `skip` marker from each endpoint's shape-completeness test and write its body against this contract; update the `# TODO` placeholder path constants in the test files to match (`/api/folder-config`, `/api/graph`).

## Architecture conventions locked in Round 1 (do not renegotiate in later rounds without recording a deviation here)

See `docs/backend/orchestrator_plan.md` "Shared architecture decided up front" section — module/file layout, client interfaces, and the two hot files (`pipeline.py`, `query_service.py`) that only one worker per round may touch.

## PDF library choice

Not pinned by any planning doc. Decision deferred to the Round 1 worker, who must record the chosen library (and why, e.g. license/maintenance/heading-detection support) here once picked.

## Round log

(Updated as each round completes — see below.)

### Round 1 (worker-foundation, Issue 1) — complete

**Graph persistence path convention:** `GRAPH_STORE_PATH` constant added to `backend/config.py`, read via `os.getenv("GRAPH_STORE_PATH", "./graph_store.json")` — sibling to `HASH_STORE_PATH`/`CHROMA_DB_PATH`. Not added as a literal line to `.env` (brief only authorized adding `CHROMA_DB_PATH`/`HASH_STORE_PATH` there); it has a working default and can still be overridden via an env var if a later worker adds one. `backend/ingestion/pipeline.py`'s `ingest_file()` calls `graph_store.persist(Path(GRAPH_STORE_PATH))` after processing all chunks in a file. **Issue 8's startup-load worker: read `backend.config.GRAPH_STORE_PATH` for the path to load on startup.**

**Module layout built exactly as specified in orchestrator_plan.md's "Shared architecture" section**, with one naming exception: the brief (`worker-foundation-brief.md`) explicitly specified `backend/main.py` (not `backend/api/main.py` as orchestrator_plan.md's table lists) for the bare FastAPI `app` object. Followed the brief since it is the authoritative per-round spec; **Round 2's worker-graph-api should mount its router onto `backend.main.app` at `backend/main.py`, not create `backend/api/main.py`.**

**Deviation — two GraphStore methods added beyond the brief's explicit method list (`add_extraction_result`, `persist`, `load`):** `merge_nodes(keep_id, merge_id)` and `remove_file(source_file)`. Neither was named in the brief's "Module layout to create" section for `graph_store/store.py`, but `docs/backend/tests/unit/test_graph_store.py` — assigned to me in full ("all 6 tests are yours") — includes `test_resolved_duplicate_concepts_are_merged_not_left_separate` and `test_deleting_file_removes_only_nodes_solely_attributable_to_it`, which require them. Implemented minimally:
- `merge_nodes(keep_id, merge_id)`: unions `source_files`, redirects `merge_id`'s in/out edges to `keep_id`, removes `merge_id`. No similarity/threshold logic — that's still Issue 4/5's job to call this with the right pair of ids.
- `remove_file(source_file)`: strips `source_file` from every node's `source_files`; a node left with an empty list is removed entirely (with its edges). No hash-store/watcher integration — that's still Issue 6/7's job to call this at the right time.
**Issue 4/5 and Issue 7 workers: these methods already exist on `GraphStore` — call them, don't recreate them.**

**mock_extraction_llm fixture design:** monkeypatches `backend.clients.openrouter_client.extract_concepts` (module attribute, so `extractor.py`'s `openrouter_client.extract_concepts(...)` call picks up the patch) with a fake exposing `.set_response(payload)` and `.set_side_effect(exc)` for per-test configuration. **Later workers reusing this fixture in new test files: call `mock_extraction_llm.set_response({...})` before invoking the code under test.**

**sample_graph fixture shape (docs/backend/tests/conftest.py):** 3 nodes / 2 edges — `concept_machine_learning` (shared: `file_a.md` + `file_b.md`), `concept_artificial_intelligence` (`file_a.md` only), `concept_neural_networks` (`file_b.md` only); edges `concept_machine_learning -[part_of]-> concept_artificial_intelligence` and `concept_neural_networks -[part_of]-> concept_machine_learning`. Chosen so both a merge test (two nodes to combine) and a delete test (one solely-attributable node vs. one shared node) have concrete fixtures without needing two separate sample graphs.

**PDF library choice:** still NOT picked — out of Issue 1's scope (markdown-only per the brief); left for Issue 2's worker as originally deferred above.

**Test results:** 17/17 assigned tests pass across `test_file_loading.py`, `test_chunking.py`, `test_extraction.py`, `test_graph_store.py`, and `test_ingestion_pipeline.py::test_single_markdown_file_ingests_end_to_end_into_persisted_graph`. The remaining 7 tests in those same files error with `NotImplementedError` from fixtures intentionally left unimplemented (`sample_txt_file`, `sample_pdf_file`, `mock_embedding_client`, `chroma_test_client`) — expected, Issue 2/3 scope. Full detail in `docs/backend/agent-reports/worker-foundation-report.md`.

**requirements.txt (created, was previously absent):** `fastapi`, `uvicorn`, `networkx`, `python-dotenv`, `openai`, `anthropic`, `pytest`, `pytest-asyncio`.

### Round 2 (worker-vector-store, Issue 3) — complete

**Refinement to decision #1's Chroma document id:** decision #1 (above) said "Document ID = `chunk_id`". Implemented instead with the Chroma document id as `hashlib.sha256(f"{chunk.source_file}:{chunk.section}:{chunk.text}".encode()).hexdigest()` — deterministic, **not** `chunk.chunk_id`. Reason: `chunk.chunk_id` is generated fresh via `uuid.uuid4()` on every call to `chunk_document()` (see `backend/ingestion/chunking.py` line 58), so re-chunking the same unchanged file on re-ingestion produces a brand-new random `chunk_id` every run. Using it as the Chroma id would defeat the "re-ingesting an unchanged file does not duplicate embeddings" acceptance criterion (Issue 3, criterion 4), since Chroma would see a "new" id each time and add a duplicate entry instead of overwriting. The deterministic hash of `source_file:section:text` is stable across re-chunking runs of unchanged content, so `collection.upsert()` (not `add()`) correctly overwrites the existing entry. `chunk_id` is still kept as its own metadata field for traceability, per decision #1's metadata schema — only the *document id* differs from what was originally decided. Metadata schema itself (`source_file`, `chunk_id`, `section`, `graph_node_ids` JSON-encoded) implemented exactly as decision #1 specifies.

**`embed_text` failure behavior is intentionally asymmetric with `extract_concepts`:** `extract_concepts` catches its own exceptions and returns an empty `{"concepts": [], "relations": []}` so a bad LLM response degrades gracefully. `embed_text` (in `backend/clients/openrouter_client.py`) does **not** do this — it lets exceptions propagate. A silently-returned zero/placeholder vector would still be stored and matched against in similarity search, quietly corrupting retrieval results in a way that's hard to detect later; better to fail loud per-chunk. The call site (`VectorStore.add_chunk`, invoked from `pipeline.ingest_file`'s per-chunk `try/except`) is what actually provides the resilience — an embedding failure is caught there and logged, skipping just that chunk's embedding, matching the pipeline's existing per-chunk-failure-isolation pattern. **Future workers: do not "fix" `embed_text` to match `extract_concepts`'s swallow-and-return-empty pattern — this is intentional, not an oversight.**

**`pipeline.ingest_file` signature extended additively:** added `vector_store: VectorStore | None = None` as a third, defaulted parameter. Existing call sites (`ingest_file(path, graph_store)`) are unaffected. When provided, each chunk is embedded and upserted into the vector store immediately after `graph_store.add_extraction_result(chunk, result)` succeeds for that chunk, inside the same per-chunk `try/except` block.

**Test results:** all 5 owned tests in `test_vector_store.py` pass, plus the owned integration test `test_ingestion_pipeline.py::test_ingested_chunks_embedded_and_traceable_to_graph_nodes_end_to_end` passes (6/6 total). Re-ran Round 1's previously-passing 17 tests (`test_file_loading.py`, `test_chunking.py`, `test_extraction.py`, `test_graph_store.py`, `test_ingestion_pipeline.py::test_single_markdown_file_ingests_end_to_end_into_persisted_graph`) — still 17/17 passing, unaffected by the additive `vector_store` param. The same 5 pre-existing errors remain in `test_file_loading.py`/`test_chunking.py` (missing `sample_txt_file`/`sample_pdf_file` fixtures — Issue 2/file-formats worker's scope, not mine).

**`mock_embedding_client` and `chroma_test_client` fixtures implemented** in `docs/backend/tests/conftest.py` (were previously `raise NotImplementedError` stubs): `mock_embedding_client` monkeypatches `backend.clients.openrouter_client.embed_text` (same `.set_response(vector)`/`.set_side_effect(exc)` pattern as `mock_extraction_llm`); `chroma_test_client` returns a real `VectorStore(path=str(tmp_path / "chroma_test"))` backed by a temp on-disk Chroma instance (not mocked). **Note for later workers using `mock_embedding_client`:** `backend/vector_store/store.py` calls embeddings via `openrouter_client.embed_text(...)` (module-attribute access, matching `extractor.py`'s pattern for `extract_concepts`), not a direct `from ... import embed_text` — this is what makes monkeypatching the module attribute actually take effect at the call site. If a future module imports `embed_text` directly by name instead, `mock_embedding_client`'s monkeypatch will not reach it.

**requirements.txt:** appended `chromadb` (installed in the shared `/workspace/.venv`, version 1.5.9 at build time).
