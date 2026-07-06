"""
Chroma-backed vector store for ingested chunks. Wraps a single Chroma
collection (`docufetch_chunks`) that stores one embedding per chunk, tagged
with metadata linking it back to the source file, section, and the graph
node id(s) that chunk's extraction produced (see backend_context.md decision
#1 for the schema). Chunk embeddings are upserted under a deterministic id
(a hash of source_file/section/text) rather than the chunk's own chunk_id, so
re-ingesting an unchanged file overwrites the same Chroma entries instead of
creating duplicates (chunk_id is a fresh uuid4 on every chunking run, even
for unchanged content).
"""
import hashlib
import json

import chromadb

from backend.clients import openrouter_client
from backend.config import CHROMA_DB_PATH
from backend.ingestion.chunking import Chunk

_COLLECTION_NAME = "docufetch_chunks"


def _chunk_doc_id(chunk: Chunk) -> str:
    """Derive a deterministic Chroma document id from a chunk's source file, section, and text."""
    key = f"{chunk.source_file}:{chunk.section}:{chunk.text}"
    return hashlib.sha256(key.encode()).hexdigest()


class VectorStore:
    """Wraps a Chroma PersistentClient's `docufetch_chunks` collection."""

    def __init__(self, path: str | None = None):
        """Open (or create) the Chroma collection at `path`, defaulting to CHROMA_DB_PATH."""
        client = chromadb.PersistentClient(path=path if path is not None else CHROMA_DB_PATH)
        self.collection = client.get_or_create_collection(_COLLECTION_NAME)

    def add_chunk(self, chunk: Chunk, node_ids: list[str]) -> None:
        """
        Embed `chunk.text` and upsert it into the collection under a
        deterministic id, with metadata linking it back to `node_ids` (the
        graph node ids this chunk's extraction produced).

        Uses upsert (not add) so re-ingesting the same unchanged content
        overwrites the existing entry instead of duplicating it.
        """
        embedding = openrouter_client.embed_text(chunk.text)
        self.collection.upsert(
            ids=[_chunk_doc_id(chunk)],
            embeddings=[embedding],
            metadatas=[
                {
                    "source_file": chunk.source_file,
                    "chunk_id": chunk.chunk_id,
                    "section": chunk.section or "",
                    "graph_node_ids": json.dumps(node_ids),
                }
            ],
        )

    def query(self, query_text: str, top_k: int = 5) -> list[dict]:
        """
        Embed `query_text` and return the top_k nearest chunks as a list of
        dicts: {"chunk_id", "source_file", "section", "graph_node_ids"
        (parsed back into a list[str]), "score"}.
        """
        embedding = openrouter_client.embed_text(query_text)
        results = self.collection.query(query_embeddings=[embedding], n_results=top_k)

        metadatas = results["metadatas"][0] if results["metadatas"] else []
        distances = results["distances"][0] if results["distances"] else []

        matches = []
        for metadata, distance in zip(metadatas, distances):
            matches.append(
                {
                    "chunk_id": metadata["chunk_id"],
                    "source_file": metadata["source_file"],
                    "section": metadata["section"],
                    "graph_node_ids": json.loads(metadata["graph_node_ids"]),
                    "score": distance,
                }
            )
        return matches

    def delete_file(self, source_file: str) -> None:
        """Remove every stored embedding whose source_file matches `source_file`."""
        self.collection.delete(where={"source_file": source_file})
