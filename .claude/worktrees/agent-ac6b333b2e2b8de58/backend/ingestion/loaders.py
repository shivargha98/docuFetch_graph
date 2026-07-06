"""
File loading for the ingestion pipeline. Reads a file from disk and returns a
Document with its text content and, if detected, markdown heading structure.
Issue 1 supports markdown only; unsupported extensions raise
UnsupportedFileType so the pipeline can skip them without crashing. Issue 2
will add .txt/.pdf support as additional elif branches - a plain if/elif is
correct here (3 formats total ever, per PRD scope), not a plugin/registry.
"""
from dataclasses import dataclass
from pathlib import Path


class UnsupportedFileType(Exception):
    """Raised by load_file when given a file extension with no loader implemented yet."""


@dataclass
class Document:
    """A loaded file's text content plus optional markdown heading structure and source path."""

    content: str
    headings: list[str] | None
    source_path: Path


def _parse_markdown_headings(content: str) -> list[str]:
    """Return the markdown heading lines (lines starting with '#') found in content, in order."""
    return [line.strip() for line in content.splitlines() if line.strip().startswith("#")]


def load_file(path: Path) -> Document:
    """
    Load a file from disk into a Document.

    For `.md` files, parses '#'/'##'/etc. heading lines into `headings`
    (None if no headings are found). Raises UnsupportedFileType for any
    extension without an implemented loader.
    """
    suffix = path.suffix.lower()
    if suffix == ".md":
        content = path.read_text(encoding="utf-8")
        headings = _parse_markdown_headings(content)
        return Document(content=content, headings=headings or None, source_path=path)
    else:
        raise UnsupportedFileType(f"No loader implemented for extension: {suffix}")
