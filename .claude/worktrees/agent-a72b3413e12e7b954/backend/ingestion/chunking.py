"""
Structure-aware chunking for the ingestion pipeline. Splits a loaded Document
into Chunks: one per markdown heading section when heading structure was
detected on load, otherwise one per paragraph (blank-line-separated block of
text) as a fallback for plain text and PDFs without clean heading markup.
"""
import re
import uuid
from dataclasses import dataclass

from backend.ingestion.loaders import Document


@dataclass
class Chunk:
    """A single unit of text sent to extraction, tagged with its source file and section."""

    chunk_id: str
    text: str
    source_file: str
    section: str | None


def _split_by_heading(content: str) -> list[tuple[str, str]]:
    """Split markdown content into (heading, section_text) pairs, one per heading and the text under it."""
    lines = content.splitlines()
    sections: list[tuple[str, str]] = []
    current_heading: str | None = None
    current_lines: list[str] = []

    def _flush() -> None:
        if current_heading is not None:
            sections.append((current_heading, "\n".join(current_lines).strip()))

    for line in lines:
        if line.strip().startswith("#"):
            _flush()
            current_heading = line.strip()
            current_lines = []
        else:
            current_lines.append(line)
    _flush()
    return sections


def _split_by_paragraph(content: str) -> list[str]:
    """Split content into non-empty paragraphs on blank-line boundaries (one or more blank lines)."""
    return [paragraph.strip() for paragraph in re.split(r"\n\s*\n", content) if paragraph.strip()]


def chunk_document(document: Document) -> list[Chunk]:
    """
    Split a Document into Chunks.

    If the document has heading structure, produces one chunk per heading
    section (heading line + the text under it). Otherwise falls back to
    paragraph-based chunking: one chunk per non-empty, blank-line-separated
    paragraph, with `section=None` since there's no heading to attribute it
    to.
    """
    chunks: list[Chunk] = []
    if document.headings:
        for heading, section_text in _split_by_heading(document.content):
            chunks.append(
                Chunk(
                    chunk_id=str(uuid.uuid4()),
                    text=f"{heading}\n{section_text}".strip(),
                    source_file=str(document.source_path),
                    section=heading.lstrip("#").strip(),
                )
            )
    else:
        for paragraph_text in _split_by_paragraph(document.content):
            chunks.append(
                Chunk(
                    chunk_id=str(uuid.uuid4()),
                    text=paragraph_text,
                    source_file=str(document.source_path),
                    section=None,
                )
            )
    return chunks
