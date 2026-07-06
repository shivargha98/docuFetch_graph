"""
Unit tests for the vector_store module: chunk embedding, Chroma indexing,
retrieval by similarity, cleanup on deletion, and dedup on re-ingestion.

Chroma collection schema is finalized (see backend_context.md decision #1 /
Round 2 log): metadata per stored chunk embedding is {"source_file",
"chunk_id", "section", "graph_node_ids" (JSON-encoded list[str])}. The Chroma
document id itself is a deterministic sha256 hash of
source_file/section/text (not chunk_id, which is a fresh uuid4 per chunking
run) so re-ingesting unchanged content overwrites rather than duplicates.
"""
import json

from backend.ingestion.chunking import Chunk


def _make_chunk(chunk_id: str, text: str, source_file: str, section: str | None = "Intro") -> Chunk:
    """Build a Chunk for test use with sensible defaults."""
    return Chunk(chunk_id=chunk_id, text=text, source_file=source_file, section=section)


def test_every_ingested_chunk_produces_a_stored_embedding(chroma_test_client, mock_embedding_client):
    """
    Given a set of ingested chunks,
    when embedding + indexing runs,
    each chunk should have a corresponding stored embedding in the Chroma
    collection.

    Source: Feature: Chunk Embedding & Chroma Indexing — criterion 1
    """
    chunk_one = _make_chunk("chunk-1", "Machine learning text.", "file_a.md")
    chunk_two = _make_chunk("chunk-2", "Artificial intelligence text.", "file_a.md")

    chroma_test_client.add_chunk(chunk_one, ["concept_machine_learning"])
    chroma_test_client.add_chunk(chunk_two, ["concept_artificial_intelligence"])

    assert chroma_test_client.collection.count() == 2


def test_query_embedding_retrieves_top_k_nearest_chunks(chroma_test_client, mock_embedding_client):
    """
    Given a Chroma collection populated with known chunk embeddings,
    when a query embedding is matched against the collection,
    the top-k results should be ranked by similarity and include the expected
    nearest chunk(s).

    Source: Feature: Chunk Embedding & Chroma Indexing — criterion 2
    """
    chunk_ml = _make_chunk("chunk-ml", "Machine learning text.", "file_a.md")
    chunk_ai = _make_chunk("chunk-ai", "Artificial intelligence text.", "file_a.md")
    chunk_nn = _make_chunk("chunk-nn", "Neural networks text.", "file_a.md")

    mock_embedding_client.set_response([1.0, 0.0, 0.0])
    chroma_test_client.add_chunk(chunk_ml, ["concept_machine_learning"])
    mock_embedding_client.set_response([0.0, 1.0, 0.0])
    chroma_test_client.add_chunk(chunk_ai, ["concept_artificial_intelligence"])
    mock_embedding_client.set_response([0.0, 0.0, 1.0])
    chroma_test_client.add_chunk(chunk_nn, ["concept_neural_networks"])

    mock_embedding_client.set_response([0.9, 0.1, 0.1])
    results = chroma_test_client.query("query text", top_k=1)

    assert len(results) == 1
    assert results[0]["chunk_id"] == "chunk-ml"


def test_deleting_file_chunks_removes_their_embeddings(chroma_test_client, mock_embedding_client):
    """
    Given embeddings stored for a file's chunks,
    when the file is deleted and cleanup runs,
    no embeddings referencing the deleted file's chunks should remain.

    Source: Feature: Chunk Embedding & Chroma Indexing — criterion 3
    """
    chunk_a = _make_chunk("chunk-a", "Text from file A.", "file_a.md")
    chunk_b = _make_chunk("chunk-b", "Text from file B.", "file_b.md")

    chroma_test_client.add_chunk(chunk_a, ["concept_a"])
    chroma_test_client.add_chunk(chunk_b, ["concept_b"])
    assert chroma_test_client.collection.count() == 2

    chroma_test_client.delete_file("file_a.md")

    remaining = chroma_test_client.collection.get()
    assert remaining["metadatas"], "expected file_b.md's chunk to remain"
    assert all(m["source_file"] != "file_a.md" for m in remaining["metadatas"])
    assert any(m["source_file"] == "file_b.md" for m in remaining["metadatas"])


def test_reingesting_unchanged_file_does_not_duplicate_embeddings(chroma_test_client, mock_embedding_client):
    """
    Given a file already ingested and embedded, with an unchanged hash,
    when the ingestion pipeline runs again over the same folder,
    no duplicate embeddings should be created for that file's chunks.

    Source: Feature: Chunk Embedding & Chroma Indexing — criterion 4
    """
    # Same source_file/section/text (what the deterministic Chroma id is
    # derived from) but a different chunk_id, simulating re-chunking the same
    # unchanged content producing a fresh uuid4 chunk_id each run.
    first_pass = _make_chunk("chunk-id-run-1", "Unchanged content.", "file_a.md")
    second_pass = _make_chunk("chunk-id-run-2", "Unchanged content.", "file_a.md")

    chroma_test_client.add_chunk(first_pass, ["concept_a"])
    chroma_test_client.add_chunk(second_pass, ["concept_a"])

    assert chroma_test_client.collection.count() == 1


def test_clear_all_removes_every_stored_embedding(chroma_test_client, mock_embedding_client):
    """
    Given a Chroma collection populated with embeddings from more than one
    source file,
    when clear_all() is called,
    the collection should be empty afterward, and subsequent add_chunk calls
    on the same VectorStore instance should still work (the collection is
    usable again, not left in a broken state).

    Source: Feature: Folder Configuration Endpoint — vector store cleanup on
    folder switch; Issue 15 caveat (previously undone: folder-switching did
    not purge old Chroma embeddings).
    """
    chunk_a = _make_chunk("chunk-a", "Text from file A.", "file_a.md")
    chunk_b = _make_chunk("chunk-b", "Text from file B.", "file_b.md")
    chroma_test_client.add_chunk(chunk_a, ["concept_a"])
    chroma_test_client.add_chunk(chunk_b, ["concept_b"])
    assert chroma_test_client.collection.count() == 2

    chroma_test_client.clear_all()
    assert chroma_test_client.collection.count() == 0

    chunk_c = _make_chunk("chunk-c", "Text from file C.", "file_c.md")
    chroma_test_client.add_chunk(chunk_c, ["concept_c"])
    assert chroma_test_client.collection.count() == 1


def test_stored_embedding_is_traceable_to_originating_graph_node_id(chroma_test_client, mock_embedding_client):
    """
    Given a chunk that produced one or more graph nodes during extraction, now
    embedded and stored,
    when the stored embedding record is inspected,
    the record contains a "graph_node_ids" metadata field (JSON-encoded
    list[str]) that resolves back to the graph node id(s) that chunk
    produced.

    Schema finalized per backend_context.md decision #1 / Round 2 log; no
    longer an open question.

    Source: Feature: Chunk Embedding & Chroma Indexing — Issue 3
    """
    chunk = _make_chunk("chunk-1", "Machine learning text.", "file_a.md")
    node_ids = ["concept_machine_learning", "concept_artificial_intelligence"]

    chroma_test_client.add_chunk(chunk, node_ids)

    stored = chroma_test_client.collection.get()
    assert len(stored["metadatas"]) == 1
    stored_node_ids = json.loads(stored["metadatas"][0]["graph_node_ids"])
    assert stored_node_ids == node_ids
