"""
File loading for the ingestion pipeline. Reads a file from disk and returns a
Document with its text content and, if detected, heading structure. Supports
`.md` (markdown '#' headings), `.txt` (always headings=None, no heading
detection for plain text per PRD), and `.pdf`. Unsupported extensions raise
UnsupportedFileType so the pipeline can skip them without crashing. This is
the full set of formats the PRD ever calls for, so a plain if/elif chain is
correct here, not a plugin/registry.

PDF heading-detection heuristic: PDFs have no markdown syntax, so a "heading"
is inferred from font size using pdfplumber's per-character size metadata.
For each text line extracted from the PDF, we compute its average character
font size. The modal (most common) size across all lines is treated as the
document's body-text size; if several sizes tie for most common, the
smallest of the tied sizes is chosen (body text is assumed to be the
smaller, more standard reading size). Any line whose size is at least 20%
larger than that modal size (PDF_HEADING_FONT_RATIO = 1.2) is treated as a
heading. If no line clears that bar (e.g. every line shares the same font
size), `headings` is None and the document falls back to paragraph-based
chunking, same as a heading-less .txt file.

When headings are detected, each heading line is marked with a "## " prefix
before being joined into `content`, so the existing markdown-style
heading-based chunker (chunking.py's `_split_by_heading`) can split PDF
content exactly the same way it splits markdown content, with no changes
needed there. When no headings are detected, content is extracted with
pdfplumber's layout-preserving mode so that blank vertical gaps between
paragraphs in the PDF become blank lines in `content`, which the
paragraph-fallback chunker splits on.
"""
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import pdfplumber

PDF_HEADING_FONT_RATIO = 1.2


class UnsupportedFileType(Exception):
    """Raised by load_file when given a file extension with no loader implemented yet."""


@dataclass
class Document:
    """A loaded file's text content plus optional heading structure and source path."""

    content: str
    headings: list[str] | None
    source_path: Path


def _parse_markdown_headings(content: str) -> list[str]:
    """Return the markdown heading lines (lines starting with '#') found in content, in order."""
    return [line.strip() for line in content.splitlines() if line.strip().startswith("#")]


def _extract_pdf_lines(path: Path) -> list[dict]:
    """
    Use pdfplumber to extract every text line across all pages of a PDF, in
    reading order, as a list of {"text": str, "size": float} dicts, where
    `size` is the average character font size for that line (used for
    heading detection).
    """
    lines: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for line in page.extract_text_lines():
                sizes = [char["size"] for char in line["chars"] if "size" in char]
                avg_size = sum(sizes) / len(sizes) if sizes else 0.0
                lines.append({"text": line["text"], "size": avg_size})
    return lines


def _detect_pdf_heading_texts(lines: list[dict]) -> set[str]:
    """
    Given PDF lines with font sizes, compute the modal (most common) font
    size as the body-text baseline (smallest size wins ties), then return
    the set of line texts whose font size is at least PDF_HEADING_FONT_RATIO
    times that baseline. Returns an empty set if no line clears the bar
    (i.e. no visual heading distinction exists in the document).
    """
    if not lines:
        return set()
    counts = Counter(line["size"] for line in lines)
    max_count = max(counts.values())
    modal_size = min(size for size, count in counts.items() if count == max_count)
    threshold = modal_size * PDF_HEADING_FONT_RATIO
    return {line["text"] for line in lines if line["size"] >= threshold}


def _load_pdf_with_headings(lines: list[dict], heading_texts: set[str]) -> tuple[str, list[str]]:
    """
    Build (content, headings) for a PDF with detected heading lines: prefix
    each detected heading line with "## " (matching the markdown heading
    convention) so the existing heading-based chunker can split PDF content
    exactly like markdown content, unchanged.
    """
    content_lines: list[str] = []
    headings: list[str] = []
    for line in lines:
        if line["text"] in heading_texts:
            marked = f"## {line['text']}"
            content_lines.append(marked)
            headings.append(marked)
        else:
            content_lines.append(line["text"])
    return "\n".join(content_lines), headings


def _extract_pdf_flat_text(path: Path) -> str:
    """
    Extract a PDF's text with paragraph (blank-line) boundaries preserved,
    for documents with no detected heading structure. Uses pdfplumber's
    layout-preserving extraction (which pads text to mirror each page's
    original vertical spacing) and strips trailing whitespace per line so
    that blank vertical gaps between paragraphs become blank lines that the
    paragraph-fallback chunker (chunking.py) can split on.
    """
    pages_text: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            raw = page.extract_text(layout=True) or ""
            pages_text.append("\n".join(line.rstrip() for line in raw.splitlines()))
    return "\n\n".join(pages_text)


def load_file(path: Path) -> Document:
    """
    Load a file from disk into a Document.

    For `.md` files, parses '#'/'##'/etc. heading lines into `headings`
    (None if no headings are found). For `.txt` files, always returns
    headings=None (no heading detection for plain text). For `.pdf` files,
    detects headings via the font-size heuristic described in this module's
    docstring; `headings` is None if no heading is detected. Raises
    UnsupportedFileType for any extension without an implemented loader.
    """
    suffix = path.suffix.lower()
    if suffix == ".md":
        content = path.read_text(encoding="utf-8")
        headings = _parse_markdown_headings(content)
        return Document(content=content, headings=headings or None, source_path=path)
    elif suffix == ".txt":
        content = path.read_text(encoding="utf-8")
        return Document(content=content, headings=None, source_path=path)
    elif suffix == ".pdf":
        lines = _extract_pdf_lines(path)
        heading_texts = _detect_pdf_heading_texts(lines)
        if heading_texts:
            content, headings = _load_pdf_with_headings(lines, heading_texts)
            return Document(content=content, headings=headings, source_path=path)
        else:
            content = _extract_pdf_flat_text(path)
            return Document(content=content, headings=None, source_path=path)
    else:
        raise UnsupportedFileType(f"No loader implemented for extension: {suffix}")
