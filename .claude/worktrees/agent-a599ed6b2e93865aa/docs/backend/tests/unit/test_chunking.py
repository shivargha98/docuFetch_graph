"""
Unit tests for the structure-aware chunking step.
Covers: heading-based chunking for markdown/PDF-with-headings, paragraph-based
fallback chunking for plain text/PDF-without-headings, and source-file
reference retention on every chunk.
"""
import pytest

from backend.ingestion.chunking import chunk_document
from backend.ingestion.loaders import load_file


def test_markdown_with_headings_produces_one_chunk_per_section(sample_markdown_file):
    """
    Given a loaded markdown document with N heading sections,
    when the document is chunked,
    exactly N chunks should be produced, one per heading section.

    Source: Feature: Structure-Aware Chunking — criterion 1; Issue 1 — criterion 1
    """
    document = load_file(sample_markdown_file)

    chunks = chunk_document(document)

    assert len(chunks) == 2
    assert chunks[0].section == "Machine Learning"
    assert chunks[1].section == "Artificial Intelligence"


def test_plain_text_without_headings_falls_back_to_paragraph_splitting(sample_txt_file):
    """
    Given a loaded .txt document with no heading structure,
    when the document is chunked,
    chunks should align with paragraph boundaries, not arbitrary character windows.

    Source: Feature: Structure-Aware Chunking — criterion 2; Issue 2 — criterion 1
    """
    raise NotImplementedError


def test_pdf_without_headings_falls_back_to_paragraph_splitting(sample_pdf_file):
    """
    Given a loaded PDF with no heading structure,
    when the document is chunked,
    chunks should align with paragraph boundaries, same fallback as plain text.

    Source: Feature: Structure-Aware Chunking — criterion 3; Issue 2 — criterion 3
    """
    raise NotImplementedError


def test_every_chunk_retains_a_source_file_reference(sample_markdown_file):
    """
    Given any loaded and chunked document (any supported format),
    when chunks are produced,
    each chunk should carry a reference back to its source file (and section,
    if applicable).

    Source: Feature: Structure-Aware Chunking — criterion 4
    """
    document = load_file(sample_markdown_file)

    chunks = chunk_document(document)

    assert len(chunks) > 0
    for chunk in chunks:
        assert chunk.source_file == str(sample_markdown_file)
        assert chunk.section is not None
