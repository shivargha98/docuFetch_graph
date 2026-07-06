# Worker Brief: Round 2 reconciliation (recover clobbered shared-file edits)

## Context — why this brief exists
Three Round 2 workers (`worker-file-formats` Issue 2, `worker-vector-store` Issue 3, `worker-graph-api` Issue 16) ran in parallel and each needed to add fixtures to the SAME shared file, `docs/backend/tests/conftest.py` (plus `requirements.txt`, `backend_context.md`, and one shared test file `docs/backend/tests/integration/test_ingestion_pipeline.py`). Because of how the sandboxed environment works, each worker copied these shared files into its isolated worktree, edited them, and copied the whole file back out to `/workspace` at the end — not a git merge. Whichever worker wrote back LAST (in this case, `worker-vector-store`) silently overwrote the other two workers' edits to those same shared files.

This has already been diagnosed precisely (do not re-diagnose, just fix per the exact list below). All PRODUCTION code (`backend/ingestion/loaders.py`, `backend/ingestion/chunking.py`, `backend/api/graph_routes.py`, `backend/main.py`, `backend/vector_store/`, `backend/graph_store/store.py`) is intact and correct — none of it lives in a file two Round-2 workers both touched, so none of it was clobbered. Only shared docs/test-infra files lost data. Verify each file's current state yourself before editing (per CLAUDE.md, don't assume) but the diagnosis below is accurate as of now.

## What was lost and what to restore

### 1. `docs/backend/tests/conftest.py`
Currently missing (present in the file as `raise NotImplementedError`, must be implemented):
- **`sample_txt_file(tmp_watch_folder)`** — write a `.txt` file with 2-3 paragraphs separated by blank lines, no heading markup, into `tmp_watch_folder`.
- **`sample_pdf_file(tmp_watch_folder)`** — write a PDF WITH clean heading structure using `fpdf2` (already in the venv). It must actually trigger `backend/ingestion/loaders.py`'s real heading heuristic: read that file's module docstring and `PDF_HEADING_FONT_RATIO = 1.2` constant first. You need at least two heading lines at a font size >= 1.2x the body text's modal size, each followed by enough body text that the body font size is unambiguously the most common size in the document (a prior attempt at this exact fixture hit a tie-breaking bug when body text was too short — use multi-line-wrapping body paragraphs, e.g. 18pt headings + several sentences of 11pt body text per section, two sections total).
- **`sample_pdf_file_no_headings(tmp_watch_folder)`** — a NEW fixture (does not exist as a stub — you're adding it): a PDF with uniform font size throughout (e.g. all 11pt, 3 paragraphs), so `_detect_pdf_heading_texts` finds no heading candidates and `headings` comes back `None`.
- **`fastapi_test_client()`** — restore exactly this (recovered from the graph-api worker's worktree, verified correct and already tested working):
```python
@pytest.fixture
def fastapi_test_client():
    """
    Provide a FastAPI `TestClient` wired to the backend app, for API/contract
    tests against HTTP endpoints.
    """
    from fastapi.testclient import TestClient

    from backend.main import app

    return TestClient(app)
```

Do NOT touch any other fixture in this file — `tmp_watch_folder`, `sample_markdown_file`, `mock_extraction_llm`, `mock_embedding_client`, `chroma_test_client`, `empty_graph`, `sample_graph` are all correctly implemented already (vector-store's edits survived since it wrote last) — leave them exactly as they are.

### 2. `requirements.txt`
Currently has: `fastapi`, `uvicorn`, `networkx`, `python-dotenv`, `openai`, `anthropic`, `pytest`, `pytest-asyncio`, `chromadb`. Append `pdfplumber` and `fpdf2` (both already `pip install`-ed into `/workspace/.venv` by the original file-formats worker — you're just restoring the requirements.txt bookkeeping, not installing anything new).

### 3. `docs/backend/backend_context.md`
The "PDF library choice" section (search for the heading `## PDF library choice`) still shows the original placeholder ("Not pinned by any planning doc. Decision deferred..."). Replace it with:
```
## PDF library choice

`pdfplumber` for production PDF reading (pure-Python, wraps `pdfminer.six`, exposes per-character font-size metadata via `page.extract_text_lines()`), chosen and implemented in `backend/ingestion/loaders.py`. `fpdf2` added as a test-only dependency to *generate* fixture PDFs (pdfplumber is read-only).

**Heading-detection heuristic:** for each text line extracted via pdfplumber, compute its average character font size. The modal (most common) size across all lines is the body-text baseline (ties broken toward the smaller size). Any line whose average size is >= 1.2x that baseline (`PDF_HEADING_FONT_RATIO = 1.2` in `loaders.py`) is a heading. If no line clears that bar, `headings` is `None` and paragraph-fallback chunking applies.
```

### 4. `docs/backend/tests/integration/test_ingestion_pipeline.py::test_mixed_format_folder_ingests_correctly`
Currently `raise NotImplementedError` (line ~71). Read the full file first (it's short, 3 tests) to match its existing style (the other two tests already use `monkeypatch.setattr(pipeline, "GRAPH_STORE_PATH", ...)` and `mock_extraction_llm.set_response(...)` — follow the same pattern). Implement:
- Given `tmp_watch_folder`, `sample_markdown_file`, `sample_txt_file`, `sample_pdf_file`, `mock_extraction_llm` fixtures (all now available after your conftest.py fixes above).
- Write one additional unsupported file directly in the test body, e.g. `(tmp_watch_folder / "notes.docx").write_text("ignored")`.
- Set a single mocked extraction response (concepts + a relation) via `mock_extraction_llm.set_response(...)`.
- Call `pipeline.ingest_file(...)` once per real file in `tmp_watch_folder` (md, txt, pdf, docx) against a fresh `GraphStore()`, redirecting `GRAPH_STORE_PATH` via `monkeypatch` same as the sibling test.
- Assert: the `.md` and `.pdf` (with-headings) files produce heading-based chunk counts consistent with their content, the `.txt` file produces paragraph-based chunks, and the `.docx` file's `ingest_file` result has `skipped=True, chunk_count=0` and does not raise.

## What NOT to touch
- Do not modify `backend/ingestion/loaders.py`, `backend/ingestion/chunking.py`, `backend/vector_store/store.py`, `backend/graph_store/store.py`, `backend/api/graph_routes.py`, `backend/main.py`, `backend/clients/openrouter_client.py` — all verified intact and correct, not part of this reconciliation.
- Do not modify `docs/backend/tests/unit/test_file_loading.py`, `test_chunking.py`, `test_graph_store.py`, `api/test_graph_read_endpoint.py` — verified intact (each was touched by only one Round-2 worker, no clobbering occurred there).
- Do not re-litigate any architectural decision — this is pure recovery of lost work, not a redesign.

## Verification (must pass before you report done)
Run, in order, and report exact pass/fail counts for each:
1. `pytest docs/backend/tests/unit/test_file_loading.py docs/backend/tests/unit/test_chunking.py docs/backend/tests/unit/test_extraction.py docs/backend/tests/unit/test_graph_store.py -v` — expect 23/23 pass (17 from Round 1 + 6 from Round 2's file-formats work), 0 errors.
2. `pytest docs/backend/tests/integration/test_ingestion_pipeline.py -v` — expect 3/3 pass.
3. `pytest docs/backend/tests/unit/test_vector_store.py -v` — expect 5/5 pass (confirm your conftest.py edits didn't disturb vector-store's fixtures).
4. `pytest docs/backend/tests/api/test_graph_read_endpoint.py -v` — expect 4/4 pass (confirm `fastapi_test_client` restoration works).

If any of these regress versus what's described above, that's a NEW bug for you to fix (not expected, but don't just report it — resolve it, since all the underlying implementations are known-good and were passing before the clobbering).

## Process note for future rounds (read, don't act on this — just acknowledge in your report)
Going forward, the orchestrator will serialize any shared-file edits (like `conftest.py`) into a single dedicated step after parallel workers finish their non-overlapping production code, specifically to prevent this clobbering pattern from recurring. You don't need to change how you work — just flag in your report if you notice any OTHER shared file (besides the four listed above) that looks like it might have suffered the same fate, so the orchestrator can check it too.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-round2-reconcile-report.md`: exact diffs applied to each of the 4 files, and the 4 verification command results (pass/fail counts) listed above. Confirm you touched only the 4 files named in this brief.
