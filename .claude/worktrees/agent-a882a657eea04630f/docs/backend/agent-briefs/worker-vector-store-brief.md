# Worker Brief: Vector Store (Issue 3)

## Context
Round 1 (Issue 1) is complete and merged into `/workspace/backend/`. You are building a new `backend/vector_store/` module and adding ONE integration hook into `backend/ingestion/pipeline.py`. You're running in parallel this round with `worker-file-formats` (Issue 2, owns `loaders.py`/`chunking.py` — you must not touch those) and `worker-graph-api` (Issue 16, owns a new `api/` module and one line in `main.py` — no overlap with you). You are the ONLY worker touching `pipeline.py` this round.

Read first: `/workspace/docs/backend/issues.md` (Issue 3), `/workspace/docs/backend/features.md` ("Vector Store" module), `/workspace/docs/backend/backend_context.md` (full — decision #1 "Chroma collection schema" is YOUR resolved contract to implement), then the actual current code:
- `/workspace/backend/ingestion/pipeline.py` — `ingest_file(path, graph_store) -> IngestResult`. Currently calls `graph_store.add_extraction_result(chunk, result)` per chunk inside a `try/except`, returning accumulated `node_ids`, then persists.
- `/workspace/backend/clients/openrouter_client.py` — `embed_text(text) -> list[float]` currently raises `NotImplementedError`; this is your function to implement.
- `/workspace/backend/graph_store/store.py` — for reference; you do not modify this file.

## What to build (Issue 3 exactly, per the ALREADY-DECIDED Chroma schema in backend_context.md)

1. **`backend/clients/openrouter_client.py::embed_text(text: str) -> list[float]`** — implement using the same `_client` (OpenAI SDK pointed at OpenRouter) already in that file: `_client.embeddings.create(model=OPENROUTER_EMBED_MODEL, input=text)` → return `.data[0].embedding`. Catch exceptions the same defensive way `extract_concepts` does (log + let caller decide — but for embeddings, a failure should propagate as an exception the vector_store layer can catch per-chunk, not silently return a zero vector, since a silently-wrong embedding would corrupt similarity search; document this asymmetry vs. `extract_concepts`'s empty-result-on-failure pattern).
2. **`backend/vector_store/__init__.py`, `backend/vector_store/store.py`** — `VectorStore` class wrapping `chromadb.PersistentClient(path=CHROMA_DB_PATH)`, single collection named `docufetch_chunks`. Methods:
   - `add_chunk(chunk: Chunk, node_ids: list[str]) -> None` — embeds `chunk.text` via `embed_text`, upserts into the collection with:
     - Chroma document id = `hashlib.sha256(f"{chunk.source_file}:{chunk.section}:{chunk.text}".encode()).hexdigest()` — **deterministic, NOT `chunk.chunk_id`** (chunk.chunk_id is a fresh `uuid4()` on every chunking run, see `chunking.py` — using it as the Chroma id would defeat the "re-ingesting an unchanged file does not duplicate embeddings" requirement, since re-chunking the same unchanged content produces a new random chunk_id every time but the same deterministic hash). Use Chroma's `upsert` (not `add`) so re-ingesting the same content overwrites rather than duplicates.
     - metadata: `{"source_file": chunk.source_file, "chunk_id": chunk.chunk_id, "section": chunk.section or "", "graph_node_ids": json.dumps(node_ids)}` — this is the exact schema decided in `backend_context.md` decision #1. `graph_node_ids` is JSON-encoded because Chroma metadata values must be scalar.
   - `query(query_text: str, top_k: int = 5) -> list[dict]` — embeds `query_text`, queries the collection, returns a list of `{"chunk_id", "source_file", "section", "graph_node_ids": <parsed list[str]>, "score"}` per result (parse the JSON-encoded field back into a list here so callers never deal with the raw string).
   - `delete_file(source_file: str) -> None` — `collection.delete(where={"source_file": source_file})`.
3. **Hook into `pipeline.py`:** add an optional `vector_store: VectorStore | None = None` parameter to `ingest_file`. Inside the existing per-chunk loop, after `node_ids.extend(graph_store.add_extraction_result(chunk, result))` succeeds, if `vector_store is not None`, call `vector_store.add_chunk(chunk, node_ids_for_this_chunk)` inside the same `try/except` so an embedding failure doesn't crash the run either (log and continue, matching the existing per-chunk resilience pattern). Keep the parameter optional/default-`None` so Round 1's existing passing tests (which call `ingest_file(path, graph_store)` with no vector_store) keep passing unchanged.

### conftest.py fixtures you must implement
- `mock_embedding_client` — monkeypatch `backend.clients.openrouter_client.embed_text` (same pattern as Round 1's `mock_extraction_llm`: expose `.set_response(vector)` / `.set_side_effect(exc)` so tests can control returned vectors and produce controlled similarity scores).
- `chroma_test_client(tmp_path)` — a real `chromadb.PersistentClient` backed by a temp path (not mocked — per the fixture's docstring, this exercises actual Chroma storage/retrieval). Likely returns a ready-to-use `VectorStore` instance (or the raw Chroma client, if your `VectorStore` constructor accepts an injectable path — prefer making `VectorStore.__init__(self, path: str | None = None)` default to `CHROMA_DB_PATH` but overridable, so this fixture can pass `tmp_path`).

## Tests you own
Run `pytest docs/backend/tests/unit/test_vector_store.py docs/backend/tests/integration/test_ingestion_pipeline.py::test_ingested_chunks_embedded_and_traceable_to_graph_nodes_end_to_end -v`. All 5 tests in `test_vector_store.py` are yours, including `test_stored_embedding_is_traceable_to_originating_graph_node_id` — for this one, assert the contract using the `graph_node_ids` metadata field (json-decoded) without hardcoding assumptions beyond what `backend_context.md` decision #1 specifies. Since the schema is now decided (not actually open anymore), you may remove the "OPEN QUESTION" framing from that test's docstring and just assert the concrete field name directly — update the docstring to say the schema is now finalized, citing `backend_context.md`.

Do NOT touch `loaders.py`, `chunking.py` (Issue 2's), or `api/` (Issue 16's).

## What NOT to build
- No retry/backoff on embedding calls unless a test needs it (none do).
- No multi-collection sharding, no configurable distance metric beyond Chroma's default (cosine) — not asked for.
- Don't wire this into the FastAPI app yet — that's Issue 16 (graph read) and later Issue 9 (retrieval seeding); you're building the module and the pipeline hook only.

## Gotchas
- `chromadb`'s `PersistentClient` creates the directory at `path` if missing — fine, matches `CHROMA_DB_PATH`'s default `./chroma_db`.
- Add `chromadb` to `requirements.txt` (append to Round 1's 8 lines, don't rewrite).
- Chroma metadata dict values must be `str`/`int`/`float`/`bool` only — `None` is not accepted for `section`; use `""` for paragraph-fallback chunks with no section (matches the metadata schema above).
- `embed_text`'s exception-propagates-not-swallows behavior is intentionally different from `extract_concepts` — document this explicitly in your report so nobody "fixes" it to match the other pattern later.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-vector-store-report.md`:
- Files created/changed (full paths) for `vector_store/`, `openrouter_client.py::embed_text`, `pipeline.py`'s new parameter, `conftest.py` fixtures, `requirements.txt`.
- Exact pytest results for your 5 owned `test_vector_store.py` tests plus the one integration test — all should pass.
- Confirm Round 1's previously-passing 17 tests still pass unchanged (run the full Round 1 test file list too, to prove your optional `vector_store` param didn't break existing call sites).
- Any deviation and why.
- Append a "Round 2 (Issue 3)" entry to `backend_context.md` documenting the deterministic-hash Chroma id decision (since it's new information beyond what was pre-decided) and confirming the metadata schema was implemented as specified.

Run the tests before reporting done.
