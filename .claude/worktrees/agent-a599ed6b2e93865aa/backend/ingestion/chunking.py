"""
Structure-aware chunking for the ingestion pipeline. Splits a loaded Document
into Chunks: one per markdown heading section when heading structure was
detected on load. Issue 2 will add a paragraph-fallback branch for documents
with no heading structure (document.headings is None) in the `else` arm below.
"""
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


def chunk_document(document: Document) -> list[Chunk]:
    """
    Split a Document into Chunks.

    If the document has heading structure, produces one chunk per heading
    section (heading line + the text under it). Otherwise falls back to
    paragraph-based chunking (Issue 2 will implement that branch).
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
        pass  # Issue 2: paragraph-based fallback chunking goes here.
    return chunks
