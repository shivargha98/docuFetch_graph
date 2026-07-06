"""
Integration tests for the end-to-end ingestion pipeline: load -> chunk ->
extract -> resolve -> persist -> embed, exercised across real file I/O, a real
(temporary) Chroma instance, and mocked LLM calls.
"""
import json

import pytest

from backend.graph_store.store import GraphStore
from backend.ingestion import pipeline


def test_single_markdown_file_ingests_end_to_end_into_persisted_graph(
    sample_markdown_file, mock_extraction_llm, tmp_path, monkeypatch
):
    """
    Given a single local markdown file with headings and related concepts,
    when the ingestion pipeline runs (load -> chunk -> extract -> persist)
    using a mocked extraction LLM with a realistic structured response,
    the persisted graph JSON should contain nodes for the concepts in the
    mocked response, edges should carry the typed relation labels, and
    reloading the persisted JSON should reconstruct an equivalent graph.

    Source: Issue 1 — full acceptance criteria; PRD user stories 8, 9, 11
    """
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(pipeline, "GRAPH_STORE_PATH", str(graph_path))

    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Machine Learning", "description": "A field of AI focused on learning from data."},
                {"name": "Artificial Intelligence", "description": "The broader field of building intelligent systems."},
            ],
            "relations": [
                {"source": "Machine Learning", "target": "Artificial Intelligence", "relation": "part_of"},
            ],
        }
    )

    graph_store = GraphStore()
    result = pipeline.ingest_file(sample_markdown_file, graph_store)

    assert result.chunk_count == 2
    assert graph_path.exists()

    persisted = json.loads(graph_path.read_text(encoding="utf-8"))
    node_names = {node["name"] for node in persisted["nodes"]}
    assert {"Machine Learning", "Artificial Intelligence"} <= node_names
    assert any(edge["relation"] == "part_of" for edge in persisted["edges"])

    reloaded = GraphStore.load(graph_path)
    assert sorted(reloaded.graph.nodes()) == sorted(graph_store.graph.nodes())
    assert sorted(reloaded.graph.edges()) == sorted(graph_store.graph.edges())


def test_mixed_format_folder_ingests_correctly(
    tmp_watch_folder, sample_markdown_file, sample_txt_file, sample_pdf_file, mock_extraction_llm
):
    """
    Given a folder containing one .md, one .txt, and one .pdf file,
    when the ingestion pipeline runs over the folder,
    all three files should be loaded, chunked appropriately (heading-based
    for md/pdf-with-headings, paragraph-based for txt/pdf-without-headings)
    and extracted, and an unsupported file in the same folder should be
    skipped without halting the run.

    Source: Issue 2 — full acceptance criteria; PRD user story 7
    """
    raise NotImplementedError


def test_ingested_chunks_embedded_and_traceable_to_graph_nodes_end_to_end(
    sample_markdown_file, mock_extraction_llm, mock_embedding_client, chroma_test_client
):
    """
    Given a freshly ingested file producing both graph nodes and Chroma
    embeddings,
    when the full ingest run completes,
    a query embedding should retrieve the expected chunk from Chroma, and the
    retrieved chunk should resolve back to the graph node id(s) it produced
    (contract-level; exact field TBD per Issue 3 open question).

    Source: Issue 3 — full acceptance criteria
    """
    raise NotImplementedError
