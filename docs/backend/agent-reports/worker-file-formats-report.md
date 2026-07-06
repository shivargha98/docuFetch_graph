### Status
COMPLETE

### What I Built

**`backend/ingestion/loaders.py`** (rewritten, 157 lines, was 46): kept the existing `.md` branch and `UnsupportedFileType`/`Document` definitions unchanged, added:
- `.txt` branch: reads plain text, `headings=None` always.
- `.pdf` branch: `_extract_pdf_lines` (pdfplumber per-line font-size extraction), `_detect_pdf_heading_texts` (modal-font-size heuristic, see below), `_load_pdf_with_headings` (marks detected heading lines with `"## "` so the existing markdown-style `_split_by_heading` in `chunking.py` works unchanged on PDF content), `_extract_pdf_flat_text` (layout-preserving extraction that turns vertical page gaps into blank lines, for the paragraph-fallback path).
- Module docstring rewritten to document the PDF heading heuristic and the two different extraction paths (marked-heading-lines vs. layout-preserving flat text).

**`backend/ingestion/chunking.py`** (rewritten, 82 lines, was 67): kept `_split_by_heading` and the heading branch of `chunk_document` untouched; filled the `else` branch with a new `_split_by_paragraph(content)` helper (`re.split(r"\n\s*\n", content)`, strips and drops empty pieces), producing one `Chunk` per non-empty paragraph with `section=None`, `source_file=str(document.source_path)`. Added `import re`.

**`docs/backend/tests/conftest.py`** (326 lines, was 245): implemented `sample_txt_file` (3 blank-line-separated paragraphs, no heading markup) and `sample_pdf_file` (now: PDF with two heading sections, built with `fpdf2` — 18pt headings, 11pt multi-line body text so the modal-size heuristic isn't ambiguous). Added a new fixture `sample_pdf_file_no_headings` (uniform 11pt, 3 paragraphs, no heading distinction) per the brief's fixture-collision instruction.

**`docs/backend/tests/unit/test_file_loading.py`**: filled in `test_plain_text_file_loads_as_unstructured_text` and `test_pdf_with_clean_headings_preserves_heading_structure`; filled in and renamed the fixture param of `test_pdf_without_headings_loads_as_flat_text` (`sample_pdf_file` → `sample_pdf_file_no_headings`).

**`docs/backend/tests/unit/test_chunking.py`**: filled in `test_plain_text_without_headings_falls_back_to_paragraph_splitting`; filled in and renamed the fixture param of `test_pdf_without_headings_falls_back_to_paragraph_splitting` (`sample_pdf_file` → `sample_pdf_file_no_headings`).

**`docs/backend/tests/integration/test_ingestion_pipeline.py`**: filled in `test_mixed_format_folder_ingests_correctly` — writes a `.docx` file directly into `tmp_watch_folder`, mocks the extraction response once, calls `pipeline.ingest_file` per file in the folder, asserts chunk counts (md=2, txt=3, pdf=2) and that the `.docx` file is returned with `skipped=True, chunk_count=0`. Added `tmp_path`/`monkeypatch` params (not listed in the brief's fixture list, but needed to redirect `pipeline.GRAPH_STORE_PATH` to a temp file — same pattern already used one test above it in this file — otherwise the test would write to the repo's real default graph-store path).

**`requirements.txt`**: appended `pdfplumber` and `fpdf2` (existing 8 lines untouched).

**`docs/backend/backend_context.md`**: filled in the "PDF library choice" section with the decision, rationale, and the heading-detection heuristic (see below), replacing the "not yet picked" placeholder.

### PDF library chosen

`pdfplumber` for production PDF reading (pure-Python, wraps `pdfminer.six`, exposes per-character font-size metadata via `page.extract_text_lines()`). `fpdf2` added as a test-only dependency to *generate* the fixture PDFs (pdfplumber is read-only). Both recorded in `backend_context.md`'s "PDF library choice" section as instructed.

### Heading-detection heuristic (PDF)

For every text line extracted via pdfplumber, compute its average character font size. The modal (most common) size across all lines is the body-text baseline; ties for most-common are broken by picking the smaller size (production robustness against equal-count edge cases — this also fixed a bug I hit in my own first fixture draft where 2 heading lines and 2 body lines tied 2-for-2 and the naive `Counter.most_common(1)` picked the heading size as "modal"). Any line whose average size is `>= 1.2x` the baseline (`PDF_HEADING_FONT_RATIO = 1.2`) is a heading. If no line clears that bar, `headings` is `None` and paragraph-fallback chunking applies.

### Test Results

Command: `pytest docs/backend/tests/unit/test_file_loading.py docs/backend/tests/unit/test_chunking.py docs/backend/tests/integration/test_ingestion_pipeline.py -v`

All 6 owned tests: **PASS**
- `test_file_loading.py::test_plain_text_file_loads_as_unstructured_text` — PASS
- `test_file_loading.py::test_pdf_with_clean_headings_preserves_heading_structure` — PASS
- `test_file_loading.py::test_pdf_without_headings_loads_as_flat_text` — PASS (fixture param renamed to `sample_pdf_file_no_headings`)
- `test_chunking.py::test_plain_text_without_headings_falls_back_to_paragraph_splitting` — PASS
- `test_chunking.py::test_pdf_without_headings_falls_back_to_paragraph_splitting` — PASS (fixture param renamed to `sample_pdf_file_no_headings`)
- `test_ingestion_pipeline.py::test_mixed_format_folder_ingests_correctly` — PASS

Full run of that command: `11 passed, 1 error in 72.13s`. The 1 error is `test_ingestion_pipeline.py::test_ingested_chunks_embedded_and_traceable_to_graph_nodes_end_to_end`, not in my scope — it fails at fixture setup with `NotImplementedError` from `mock_embedding_client` (Issue 3 / vector-store worker's fixture to implement, explicitly excluded by the brief).

Regression check — reran the 17 tests Round 1 made pass (`test_file_loading.py`, `test_chunking.py`, `test_extraction.py`, `test_graph_store.py`, and `test_ingestion_pipeline.py::test_single_markdown_file_ingests_end_to_end_into_persisted_graph`) together with my 6 new ones: **23 passed, 0 failed** in that combined run. No regressions.

I also ran the full `docs/backend/tests/` suite to confirm no unexpected interaction with other in-progress Round 2 workers' files: 18 failed / 27 passed / 3 skipped / 1 xfailed / 40 errors — all failures/errors are in test files outside my ownership (entity resolution, concurrency, retrieval, vector store, WS streaming, folder-config/graph API, chat session, RAG pipeline), consistent with those being other issues'/other workers' in-progress or not-yet-started scope, not caused by my changes.

### What the Orchestrator Should Know

- **Deviation:** added `tmp_path` and `monkeypatch` as extra fixture parameters to `test_mixed_format_folder_ingests_correctly`, beyond the four fixtures the brief explicitly named. Reason: without redirecting `pipeline.GRAPH_STORE_PATH` to a temp file (as the test directly above it already does), the test would call `graph_store.persist()` against the real default `GRAPH_STORE_PATH` on every run, writing a stray file into the repo. This mirrors the existing pattern in the same file, so it's a minimal, low-risk addition rather than new scope.
- **Fixture content change:** I changed `sample_pdf_file`'s originally-planned simple 2-line-body paragraphs to longer, multi-line-wrapped body paragraphs. Reason: with only 2 heading lines and 2 short (single-line) body lines, the font-size counts tied 2-for-2, and Python's `Counter.most_common(1)` picked the heading's font size as "modal" (arbitrary tie-break by insertion order), which broke heading detection. Longer body paragraphs that wrap into multiple lines make the body font size unambiguously modal, matching how a real document would look. I also hardened `_detect_pdf_heading_texts` itself (smallest-size-wins-ties) as defense in depth, but kept the more realistic fixture regardless.
- **`sample_pdf_file` fixture now writes `sample.pdf`; `sample_pdf_file_no_headings` writes `sample_flat.pdf`** — different filenames so both can coexist in the same `tmp_watch_folder` for the mixed-format integration test without colliding.
- Did not touch `backend/ingestion/pipeline.py`, `backend/vector_store/`, `backend/api/`, or `backend/main.py`, per the brief's exclusivity instructions — verified via file mtimes before finishing that none of those were modified by this work.
- Environment note: the project's `.venv` (Python 3.11.2) did not have `pdfplumber`/`fpdf2`/`reportlab` installed; I installed `pdfplumber` and `fpdf2` into it via `pip install` so tests could run, in addition to appending them to `requirements.txt`.

### What the Next Worker Needs

No other worker depends on `loaders.py`/`chunking.py` outputs changing shape — `Document` and `Chunk` dataclass fields are unchanged from Round 1 (only new branches/helpers added). `load_file(path) -> Document` and `chunk_document(document) -> list[Chunk]` signatures are unchanged. Any future worker adding a 4th file format should follow the same `if/elif` pattern (out of scope for now — brief explicitly caps supported formats at md/txt/pdf).

### Blockers

None. No dependency files were missing; `pdfplumber`/`fpdf2` were not pre-installed in the venv but installing them was within this worker's own scope (test-only + production dependency for this issue).
