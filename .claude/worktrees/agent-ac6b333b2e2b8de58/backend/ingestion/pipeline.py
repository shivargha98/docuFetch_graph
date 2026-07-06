"""
Ingestion pipeline orchestrator. Wires together file loading, chunking,
extraction, and graph-store updates for a single file, then persists the
graph. Issue 1 handles one markdown file at a time; later issues extend this
same ingest_file entry point for other formats, entity resolution, vector
storage, and watching.
"""
import logging
from dataclasses import dataclass, field
from pathlib import Path

from backend.config import GRAPH_STORE_PATH
from backend.extraction.extractor import extract_from_chunk
from backend.graph_store.store import GraphStore
from backend.ingestion.chunking import chunk_document
from backend.ingestion.loaders import UnsupportedFileType, load_file

logger = logging.getLogger(__name__)


@dataclass
class IngestResult:
    """Outcome of ingesting a single file: which chunks were processed and which graph nodes were touched."""

    source_path: Path
    chunk_count: int
    node_ids: list[str] = field(default_factory=list)
    skipped: bool = False


def ingest_file(path: Path, graph_store: GraphStore) -> IngestResult:
    """
    Load, chunk, extract, and graph-update a single file, then persist the
    graph to GRAPH_STORE_PATH.

    If the file's extension isn't supported, the file is skipped (returns an
    IngestResult with skipped=True) instead of raising. A malformed/failed
    extraction for one chunk is caught so it doesn't abort processing of the
    other chunks in the same file.
    """
    try:
        document = load_file(path)
    except UnsupportedFileType:
        logger.info("Skipping unsupported file type: %s", path)
        return IngestResult(source_path=path, chunk_count=0, node_ids=[], skipped=True)

    chunks = chunk_document(document)
    node_ids: list[str] = []
    for chunk in chunks:
        try:
            result = extract_from_chunk(chunk)
            node_ids.extend(graph_store.add_extraction_result(chunk, result))
        except Exception:
            logger.exception("Failed to process chunk %s from %s; skipping chunk", chunk.chunk_id, path)

    graph_store.persist(Path(GRAPH_STORE_PATH))
    return IngestResult(source_path=path, chunk_count=len(chunks), node_ids=node_ids)
