# Worker Brief: Foundation (Issue 1)

## Context
docuFetch Graph backend is a from-scratch FastAPI build (no `backend/` code exists yet, `requirements.txt` is empty). You are the FIRST worker. Every later round's worker will build directly on the module layout and interfaces you create — be deliberate and document your choices, because you cannot "check with" later workers, but they will read `docs/backend/backend_context.md` and copy your conventions.

Read these before writing any code, in this order:
1. `/workspace/.claude/CLAUDE.md` — coding rules you MUST follow: docstring on every function, a file-level description comment at the top of every file, simplicity-first (minimum code, no speculative abstractions), surgical changes only.
2. `/workspace/docs/backend/issues.md` — Issue 1 section only for your scope, but skim the rest so you understand what interfaces later issues will need from you.
3. `/workspace/docs/backend/prd.md` and `/workspace/docs/backend/features.md` for the "Ingestion", "Extraction", and "Graph Store" module sections.
4. `/workspace/docs/backend/orchestrator_plan.md` — "Shared architecture decided up front" section. This is the module layout you must create.
5. `/workspace/docs/backend/backend_context.md` — read the whole file; it has decisions relevant to interfaces you're setting up (later workers will consume your client interfaces).
6. `/workspace/docs/backend/tests/conftest.py` and these test files (your exact spec — implement against them):
   - `/workspace/docs/backend/tests/unit/test_file_loading.py` (you only need the markdown + unsupported-extension cases to pass; the `.txt`/`.pdf` cases belong to Issue 2's worker next round — but don't let their tests error out due to *your* code; they'll naturally fail via `NotImplementedError` fixtures until Issue 2 lands, which is expected)
   - `/workspace/docs/backend/tests/unit/test_chunking.py` (you only need the markdown heading-based case + source-file-reference case to pass; txt/pdf paragraph fallback is Issue 2's)
   - `/workspace/docs/backend/tests/unit/test_extraction.py` (all 6 tests are yours)
   - `/workspace/docs/backend/tests/unit/test_graph_store.py` (all 6 tests are yours)
   - `/workspace/docs/backend/tests/integration/test_ingestion_pipeline.py::test_single_markdown_file_ingests_end_to_end_into_persisted_graph` (yours; the other two tests in that file belong to Issues 2 and 3 — leave them `NotImplementedError`)

## Environment
`.env` at `/workspace/.env` already has real values for `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `WATCH_FOLDER`, `ANTHROPIC_MODEL`, `OPENROUTER_EMBED_MODEL`, `OPENROUTER_LLM_MODEL`. Do NOT overwrite existing values. You should add `CHROMA_DB_PATH=./chroma_db` and `HASH_STORE_PATH=./hash_store.json` if not present (these are just path config, not secrets — `.env.example` already documents them).

## What to build (Issue 1 exactly)

End-to-end tracer bullet: load one local `.md` file → chunk by heading/section → send each chunk to the OpenRouter extraction model for concept names/descriptions/typed relations → write into a networkx graph → persist to disk as JSON. No watcher, no multi-file handling, no vector store yet.

### Module layout to create (do not deviate — later rounds depend on these exact paths/names)
- `backend/__init__.py`
- `backend/config.py` — loads env vars via `python-dotenv`, exposes named constants (`WATCH_FOLDER`, `CHROMA_DB_PATH`, `HASH_STORE_PATH`, `OPENROUTER_API_KEY`, `OPENROUTER_LLM_MODEL`, `OPENROUTER_EMBED_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`). Also add (as placeholders future rounds will use, values from `backend_context.md`): `ENTITY_RESOLUTION_MERGE_THRESHOLD = 0.90`, `ENTITY_RESOLUTION_AMBIGUOUS_LOW = 0.75`, `NO_MATCH_SIMILARITY_CUTOFF = 0.35`. (You don't use these yet, but define them now so config.py has one owner.)
- `backend/clients/__init__.py`
- `backend/clients/openrouter_client.py` — implement `extract_concepts(chunk_text: str) -> dict` that calls OpenRouter's chat-completions-compatible endpoint (OpenRouter is OpenAI-API-compatible; use the `openai` Python SDK pointed at `https://openrouter.ai/api/v1` with `OPENROUTER_API_KEY`, model = `OPENROUTER_LLM_MODEL`) with a structured prompt asking for JSON: `{"concepts": [{"name": str, "description": str}], "relations": [{"source": str, "target": str, "relation": str}]}` (source/target refer to concept names within this chunk). Parse the JSON response defensively — if it's malformed/unparseable, catch the exception and return an empty/error result rather than raising, so the caller can skip this chunk. Also stub (function signature + docstring + `NotImplementedError` body is fine) `embed_text(text: str) -> list[float]` and `traversal_next_hop(...)` for later rounds to fill in — just so the module exists and imports don't break.
- `backend/clients/anthropic_client.py` — stub `generate_answer(...)` and `judge_relevance(...)` (signatures + docstrings, `NotImplementedError` bodies) for Issue 11/12 to fill in later. Not exercised by any Issue-1 test.
- `backend/ingestion/__init__.py`
- `backend/ingestion/loaders.py` — `load_file(path: Path) -> Document` where `Document` is a small dataclass with `content: str`, `headings: list[str] | None` (populated if heading structure detected, else `None`), `source_path: Path`. For Issue 1 you only need markdown support (parse `#`/`##`/etc. heading lines) and an "unsupported extension → return `None` or raise a specific `UnsupportedFileType` that the pipeline catches and skips" path — Issue 2 will add `.txt`/`.pdf` next round. Design the function so adding new formats later is a simple additional `elif suffix == ...` branch — do NOT build a plugin/registry abstraction (CLAUDE.md: no speculative abstraction for a 3-format problem).
- `backend/ingestion/chunking.py` — `chunk_document(document: Document) -> list[Chunk]` where `Chunk` has `chunk_id: str (uuid4)`, `text: str`, `source_file: str`, `section: str | None`. For Issue 1: if `document.headings` is populated, split into one chunk per heading section. (Issue 2 will add the paragraph-fallback branch for when `headings` is `None` — leave a clear place for that, e.g. an `if/else` you can extend, not a TODO stub that breaks.)
- `backend/extraction/__init__.py`
- `backend/extraction/extractor.py` — `extract_from_chunk(chunk: Chunk) -> ExtractionResult` (dataclass: `concepts: list[dict]`, `relations: list[dict]`) — calls `openrouter_client.extract_concepts`, handles malformed responses gracefully (catch, log, return empty `ExtractionResult`), never raises out to the pipeline.
- `backend/graph_store/__init__.py`
- `backend/graph_store/store.py` — `GraphStore` class wrapping a `networkx.MultiDiGraph` (use `MultiDiGraph` since two concepts can have more than one typed relation between them). Methods:
  - `add_extraction_result(chunk: Chunk, result: ExtractionResult) -> list[str]` — adds/updates concept nodes (id = stable slug derived from name, e.g. `concept_<slugified-name>`; if node already exists, append `chunk.source_file` to its `source_files` set instead of creating a duplicate — this is the *simplest* same-file-idempotency, not full entity resolution, which is Issues 4/5) and typed edges between concepts named in `result.relations`. Returns the list of node ids this chunk produced (needed by Issue 3 for the Chroma linkage).
  - `persist(path: Path) -> None` — serialize to JSON (`networkx.node_link_data` is fine, or a hand-rolled equivalent — your call, but document it).
  - `load(path: Path) -> GraphStore` (classmethod or module function) — reload from JSON into an equivalent graph.
  - Node schema: `id`, `name`, `description`, `source_files: list[str]`. Edge schema: `source`, `target`, `relation` (typed label).
- `backend/ingestion/pipeline.py` — `ingest_file(path: Path, graph_store: GraphStore) -> IngestResult` orchestrating load → chunk → extract → `graph_store.add_extraction_result` per chunk → (you call `graph_store.persist(...)` at the end, using `HASH_STORE_PATH`'s sibling convention or a `GRAPH_STORE_PATH` you add to config.py — pick one and document it in backend_context.md). A malformed extraction for one chunk must not abort processing of the other chunks in the same file (catch per-chunk).
- `backend/main.py` — minimal FastAPI app instantiation (`app = FastAPI()`), no routes yet. Round 2's `worker-graph-api` will add the first route and `worker-vector-store`/later rounds will import this same `app` object — so make sure `app` is a clean, importable module-level object.

### conftest.py fixtures you must implement (leave others as `NotImplementedError` for later rounds)
- `tmp_watch_folder`
- `sample_markdown_file` — must contain at least two headings with distinct extractable concepts and one stated directional relation (e.g. "## Machine Learning\nMachine learning is part of Artificial Intelligence.\n\n## Artificial Intelligence\n...") so extraction/relation-direction tests have deterministic content to assert against.
- `mock_extraction_llm` — should monkeypatch/mock `backend.clients.openrouter_client.extract_concepts` (or wherever the real call lives) so tests can configure per-test return payloads (valid structured JSON, or malformed garbage for the error-handling test) without hitting the real network.
- `empty_graph`
- `sample_graph` — small pre-populated graph with nodes/edges spanning more than one source file (later rounds need this for merge/delete tests too, so make it reasonably general: e.g. 3 nodes, 2 edges, where one node is shared between "file_a.md" and "file_b.md").

## What NOT to build
- No watcher, no multi-file batch ingestion loop, no vector store, no entity resolution beyond same-file node reuse, no API routes beyond the bare `FastAPI()` app object, no WebSocket, no chat session. All of that is later rounds.
- No plugin/registry abstraction for file loaders — a plain if/elif is correct for 1 format now, 3 formats total ever (per PRD scope).
- No retry/backoff logic for the OpenRouter call unless a test requires it (none do) — CLAUDE.md says no error handling for scenarios not required.

## Test requirements
Run `pytest docs/backend/tests/unit/test_file_loading.py docs/backend/tests/unit/test_chunking.py docs/backend/tests/unit/test_extraction.py docs/backend/tests/unit/test_graph_store.py docs/backend/tests/integration/test_ingestion_pipeline.py -v` from `/workspace`. You need `conftest.py`'s fixtures resolvable — implement the ones listed above. It is EXPECTED that some tests fail/error because they need fixtures owned by Issue 2/3 workers (`sample_txt_file`, `sample_pdf_file`, `mock_embedding_client`, `chroma_test_client`) — do not implement those fixtures yourself, just leave them raising `NotImplementedError` (do not delete them). Confirm in your report exactly which test functions now pass vs. which still fail due to not-yet-implemented fixtures (name them explicitly).

Add dependencies to `/workspace/requirements.txt` (create it): at minimum `fastapi`, `uvicorn`, `networkx`, `python-dotenv`, `openai` (for OpenRouter's OpenAI-compatible client), `anthropic`, `pytest`, `pytest-asyncio` if you use async. Do not add chromadb/watchdog/pypdf yet — those belong to later-round workers who will append their own deps.

## Gotchas
- OpenRouter is OpenAI-API-compatible: use `openai.OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)` then `.chat.completions.create(model=OPENROUTER_LLM_MODEL, ...)`. Do not use Anthropic's SDK for this call.
- Tests mock the extraction client — make sure your extraction call is patchable (e.g. call through `backend.clients.openrouter_client.extract_concepts`, not an inline unmockable client instantiation inside `extractor.py`).
- Use `MultiDiGraph`, not `DiGraph` — two concepts could plausibly have more than one relation type stated across different chunks/files.
- Pick a JSON persistence path convention now (e.g. `GRAPH_STORE_PATH` in config.py, sibling to `HASH_STORE_PATH`) and record it in `backend_context.md` under a new "Round 1 decisions" entry — Issue 8's startup-load worker needs this path.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-foundation-report.md` covering:
- Every file you created (full paths).
- Exact pytest results (pass/fail/error count) for the 5 test files listed above, naming which specific tests pass and which fail due to not-yet-implemented fixtures (expected) vs. genuine bugs (not expected — fix those before reporting done).
- Your chosen graph persistence path convention (added to config.py) — restate it explicitly so I can pass it to later workers.
- Confirmation you did NOT implement `sample_txt_file`, `sample_pdf_file`, `mock_embedding_client`, `chroma_test_client`, `mock_traversal_llm`, `mock_haiku_client`, `entity_resolution_thresholds`, `no_match_cutoff`, `fastapi_test_client`, `ws_test_client` fixtures (they must remain `NotImplementedError` for later rounds).
- Any deviation from this brief and why.
- requirements.txt final contents.

Run the tests before reporting done, per CLAUDE.md's "Goal-Driven Execution: define success criteria, loop until verified."
