"""
Unit tests for the ingestion file-loading step.
Covers: loading markdown, plain text, and PDF files (with/without heading
structure), and skipping unsupported file extensions without crashing.
"""
import pytest

from backend.ingestion.loaders import UnsupportedFileType, load_file


def test_markdown_file_preserves_heading_structure_on_load(sample_markdown_file):
    """
    Given a .md file with multiple heading levels,
    when the file is loaded,
    the loaded representation should retain heading boundaries for the chunker.

    Source: Feature: File Loading — criterion 1
    """
    document = load_file(sample_markdown_file)

    assert document.headings is not None
    assert document.headings == ["## Machine Learning", "## Artificial Intelligence"]


def test_plain_text_file_loads_as_unstructured_text(sample_txt_file):
    """
    Given a .txt file with paragraphs but no heading markup,
    when the file is loaded,
    the loaded representation should have no heading structure (plain passthrough).

    Source: Feature: File Loading — criterion 2
    """
    raise NotImplementedError


def test_pdf_with_clean_headings_preserves_heading_structure(sample_pdf_file):
    """
    Given a PDF with clean heading markup,
    when the file is loaded,
    the loaded representation should retain heading boundaries, same as markdown.

    Source: Feature: File Loading — criterion 3
    """
    raise NotImplementedError


def test_pdf_without_headings_loads_as_flat_text(sample_pdf_file):
    """
    Given a PDF with no discernible heading structure,
    when the file is loaded,
    the loaded representation should have no heading structure, ready for
    paragraph-fallback chunking.

    Source: Feature: File Loading — criterion 3 (fallback case); Issue 2 — criterion 2
    """
    raise NotImplementedError


def test_unsupported_extension_is_skipped_without_crashing(tmp_watch_folder):
    """
    Given a file with an unsupported extension (e.g. .docx),
    when the loader processes the watched folder,
    the file should be skipped and no exception should propagate.

    load_file signals unsupported extensions via the specific, documented
    UnsupportedFileType exception rather than an arbitrary crash (e.g. a raw
    parse error) - this is the controlled, catchable signal the ingestion
    pipeline (backend.ingestion.pipeline.ingest_file) catches to skip the
    file without aborting the run.

    Source: Feature: File Loading — criterion 4; Issue 2 — criterion 4
    """
    unsupported_file = tmp_watch_folder / "notes.docx"
    unsupported_file.write_text("some content", encoding="utf-8")

    with pytest.raises(UnsupportedFileType):
        load_file(unsupported_file)
