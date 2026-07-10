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

from backend.concurrency.lock import GRAPH_LOCK
from backend.config import GRAPH_STORE_PATH
from backend.extraction.extractor import extract_from_chunk
from backend.graph_store.store import GraphStore
from backend.ingestion.chunking import chunk_document
from backend.ingestion.loaders import UnsupportedFileType, load_file
from backend.vector_store.store import VectorStore

logger = logging.getLogger(__name__)


@dataclass
class IngestResult:
    """Outcome of ingesting a single file: which chunks were processed and which graph nodes were touched."""

    source_path: Path
    chunk_count: int
    node_ids: list[str] = field(default_factory=list)
    skipped: bool = False


def ingest_file(path: Path, graph_store: GraphStore, vector_store: VectorStore | None = None) -> IngestResult:
    """
    Load, chunk, extract, and graph-update a single file, then persist the
    graph to GRAPH_STORE_PATH.

    If the file's extension isn't supported, the file is skipped (returns an
    IngestResult with skipped=True) instead of raising. A malformed/failed
    extraction for one chunk is caught so it doesn't abort processing of the
    other chunks in the same file.

    If `vector_store` is given, each chunk's text is also embedded and stored
    there (Issue 3), linked to the graph node id(s) that chunk produced. An
    embedding failure for one chunk is caught the same way an extraction
    failure is, so it doesn't abort the rest of the run. `vector_store`
    defaults to None so existing callers that don't pass one are unaffected.

    Locking (fine-grained, 2026-07-10): the slow per-chunk LLM extraction
    runs OUTSIDE GRAPH_LOCK; only the fast in-memory graph/vector mutation
    for each chunk (and the final persist) holds it. Concurrent chat queries
    therefore wait microseconds per mutation instead of ~80s per file, and
    traverse whatever concepts have landed so far.
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
            with GRAPH_LOCK:
                chunk_node_ids = graph_store.add_extraction_result(chunk, result)
                node_ids.extend(chunk_node_ids)
                if vector_store is not None:
                    vector_store.add_chunk(chunk, chunk_node_ids)
        except Exception:
            logger.exception("Failed to process chunk %s from %s; skipping chunk", chunk.chunk_id, path)

    with GRAPH_LOCK:
        graph_store.persist(Path(GRAPH_STORE_PATH))
    return IngestResult(source_path=path, chunk_count=len(chunks), node_ids=node_ids)
