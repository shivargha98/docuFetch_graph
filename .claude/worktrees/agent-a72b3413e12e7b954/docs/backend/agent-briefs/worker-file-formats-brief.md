# Worker Brief: File Formats (Issue 2)

## Context
Round 1 (Issue 1) is complete and merged into `/workspace/backend/`. It built markdown-only file loading + heading-based chunking. You are extending exactly two existing files — `backend/ingestion/loaders.py` and `backend/ingestion/chunking.py` — to add `.txt` and `.pdf` support and paragraph-fallback chunking. You are running in parallel this round with `worker-vector-store` (Issue 3) and `worker-graph-api` (Issue 16) — they do NOT touch `loaders.py` or `chunking.py`, so you have exclusive ownership of those two files this round. Do not touch `backend/ingestion/pipeline.py` (Issue 3's worker owns a one-line hook there this round).

Read first: `/workspace/docs/backend/issues.md` (Issue 2 section), `/workspace/docs/backend/backend_context.md` (full — has the PDF-library note still open, waiting for you), then read the actual current code:
- `/workspace/backend/ingestion/loaders.py` — `load_file(path) -> Document` currently handles only `.md` (parses `#`-prefixed lines as headings), raises `UnsupportedFileType` otherwise.
- `/workspace/backend/ingestion/chunking.py` — `chunk_document(document) -> list[Chunk]` currently only has the `if document.headings:` branch (heading-based split); the `else: pass` is a placeholder you fill in.

## What to build (Issue 2 exactly)

1. **`.txt` support in `loaders.py`:** add `elif suffix == ".txt":` — read the file as plain text, `headings=None` always (no heading detection for plain text per PRD).
2. **`.pdf` support in `loaders.py`:** add `elif suffix == ".pdf":`. Pick a PDF text-extraction library and record your choice + rationale in `backend_context.md` under "PDF library choice" (currently marked "not yet picked, deferred to Issue 2's worker"). Recommendation: `pdfplumber` (pure-Python, wraps pdfminer.six, exposes per-character font-size metadata which lets you build a real heading heuristic instead of guessing) — but your call if you have a good reason otherwise.
   - **Heading detection heuristic for PDF:** since PDFs have no markdown syntax, a "heading" must be inferred from formatting. A reasonable, simple heuristic (CLAUDE.md: simplicity first): compute the modal (most common) font size across all text in the PDF (this is "body text" size); any line whose font size is at least 20% larger than that modal size is treated as a heading. If every line is the same font size (no visual distinction), `headings` is `None` (no heading structure detected → paragraph fallback applies). Document this heuristic in the file's module docstring since it's a judgment call, not a spec.
3. **Paragraph-fallback chunking in `chunking.py`:** fill in the `else` branch of `chunk_document` — split `document.content` on blank-line boundaries (`\n\s*\n`, i.e. one or more blank lines), producing one `Chunk` per non-empty paragraph, `section=None` for these chunks (since there's no heading to attribute them to), `source_file=str(document.source_path)`.
4. **Unsupported extensions:** already handled by Issue 1's existing `UnsupportedFileType` + `pipeline.py`'s try/except — you don't need to touch this, just don't break it.

### conftest.py fixtures you must implement
- `sample_txt_file(tmp_watch_folder)` — write a `.txt` file with 2-3 paragraphs (blank-line separated), no heading markup.
- `sample_pdf_file(tmp_watch_folder)` — write a PDF **with clean heading structure** (per your chosen heuristic — e.g. two sections, each with a larger-font heading line followed by body-size paragraph text) using your chosen PDF library's write capability (`pdfplumber` is read-only — for *generating* a test PDF you'll likely need `reportlab` or `fpdf2` as a test-only dependency; add whichever you pick to `requirements.txt`).
- **New fixture needed — `sample_pdf_file_no_headings(tmp_watch_folder)`:** the test stubs `test_pdf_without_headings_loads_as_flat_text` (in `test_file_loading.py`) and `test_pdf_without_headings_falls_back_to_paragraph_splitting` (in `test_chunking.py`) both currently declare a parameter named `sample_pdf_file`, which collides with the "with headings" fixture above — a single fixture can't return two different PDF variants. **Add a new fixture `sample_pdf_file_no_headings`** (PDF with uniform font size, no visual heading distinction) and **rename the parameter in those two specific test functions** from `sample_pdf_file` to `sample_pdf_file_no_headings`. This is a legitimate stub-filling edit — `conftest.py`'s own docstring anticipated this ("provide two variants via parametrization or separate fixtures if needed").

## Tests you own
Run `pytest docs/backend/tests/unit/test_file_loading.py docs/backend/tests/unit/test_chunking.py docs/backend/tests/integration/test_ingestion_pipeline.py -v`. Your scope:
- `test_file_loading.py::test_plain_text_file_loads_as_unstructured_text`
- `test_file_loading.py::test_pdf_with_clean_headings_preserves_heading_structure`
- `test_file_loading.py::test_pdf_without_headings_loads_as_flat_text` (after renaming its fixture param, see above)
- `test_chunking.py::test_plain_text_without_headings_falls_back_to_paragraph_splitting`
- `test_chunking.py::test_pdf_without_headings_falls_back_to_paragraph_splitting` (after renaming its fixture param)
- `test_ingestion_pipeline.py::test_mixed_format_folder_ingests_correctly` — needs `sample_markdown_file` + `sample_txt_file` + `sample_pdf_file` + `mock_extraction_llm` (all already available: markdown/mock_extraction_llm from Round 1, txt/pdf from you) plus one unsupported file (e.g. a `.docx`) written directly into `tmp_watch_folder` in the test body to prove it's skipped without halting the run.

Do NOT touch the 17 tests Round 1 already made pass, and do NOT implement `mock_embedding_client`/`chroma_test_client`/`fastapi_test_client` (other workers own those this round).

## What NOT to build
- No plugin/registry abstraction for formats — this brings total supported formats to 3 (md/txt/pdf), which is the full PRD scope forever; a plain `if/elif` chain is correct.
- No OCR fallback for image-based PDFs, no table extraction — out of scope.
- Don't touch `pipeline.py` or `graph_store/store.py` — not your files this round.

## Gotchas
- `pdfplumber` (or whatever you pick) needs to go in `requirements.txt` — append, don't rewrite the existing 8 lines Round 1 added.
- If you use `reportlab`/`fpdf2` purely to *generate* test fixture PDFs, that's a test-only dependency — still fine to add to `requirements.txt` (no separate dev-requirements file exists, keep it simple).
- Reuse the `mock_extraction_llm` fixture pattern already in `conftest.py` (monkeypatches `backend.clients.openrouter_client.extract_concepts` with `.set_response()`/`.set_side_effect()`) — don't reinvent it for your integration test.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-file-formats-report.md`:
- Files changed (full diffs summary) for `loaders.py`, `chunking.py`, `conftest.py`, `requirements.txt`, and the two test files whose fixture params you renamed.
- PDF library chosen + why (also confirm you added this to `backend_context.md`'s "PDF library choice" section).
- Your heading-detection heuristic for PDFs, stated precisely (font-size ratio used).
- Exact pytest results for your 6 owned tests (all must pass — this round has no "expected NotImplementedError" cases left in your files since you're the last one touching loaders.py/chunking.py).
- Any deviation and why.

Run the tests before reporting done.
