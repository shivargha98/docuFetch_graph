"""
Unit tests for LLM-based concept and typed-relation extraction.
Covers: concept name/description extraction, grounding (no fabrication),
graceful handling of malformed LLM responses, typed relation labels, relation
direction, and not forcing edges where no relation is stated.
"""
import pytest

from backend.extraction.extractor import extract_from_chunk
from backend.ingestion.chunking import Chunk


def test_concept_extraction_returns_names_and_descriptions_for_a_chunk(mock_extraction_llm):
    """
    Given a single chunk of text and a mocked OpenRouter extraction response,
    when concept extraction is run on the chunk,
    the result should be a list of concepts, each with a non-empty name and
    description.

    Source: Feature: LLM Concept Extraction — criterion 1; Issue 1 — criterion 2
    """
    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Machine Learning", "description": "A field of AI focused on learning from data."},
                {"name": "Artificial Intelligence", "description": "The broader field of building intelligent systems."},
            ],
            "relations": [],
        }
    )
    chunk = Chunk(
        chunk_id="c1",
        text="Machine Learning is part of Artificial Intelligence.",
        source_file="file_a.md",
        section="Machine Learning",
    )

    result = extract_from_chunk(chunk)

    assert len(result.concepts) == 2
    for concept in result.concepts:
        assert concept["name"]
        assert concept["description"]


def test_extraction_does_not_fabricate_concepts_absent_from_chunk(mock_extraction_llm):
    """
    Given a chunk with known, narrow content and a mocked extraction response,
    when concept extraction is run,
    returned concepts should be traceable to terms/ideas actually present in
    the chunk.

    Source: Feature: LLM Concept Extraction — criterion 2
    """
    chunk = Chunk(
        chunk_id="c2",
        text="Photosynthesis converts light energy into chemical energy.",
        source_file="file_b.md",
        section="Photosynthesis",
    )
    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Photosynthesis", "description": "Process converting light energy into chemical energy."},
            ],
            "relations": [],
        }
    )

    result = extract_from_chunk(chunk)

    concept_names = {concept["name"] for concept in result.concepts}
    assert concept_names == {"Photosynthesis"}
    for concept in result.concepts:
        assert concept["name"].lower() in chunk.text.lower()


def test_malformed_extraction_response_does_not_crash_pipeline(mock_extraction_llm):
    """
    Given a chunk and a mocked extraction call that returns malformed/unparseable
    output,
    when concept extraction is run,
    the error should be caught and handled without raising out of the ingestion
    run, and other chunks in the same run should be unaffected.

    Source: Feature: LLM Concept Extraction — criterion 3; Issue 1 — criterion 5
    """
    chunk = Chunk(chunk_id="c3", text="Some content.", source_file="file_c.md", section=None)
    mock_extraction_llm.set_response("not a dict, just a garbage string")

    result = extract_from_chunk(chunk)

    assert result.concepts == []
    assert result.relations == []


def test_extracted_edges_carry_a_nonempty_typed_relation_label(mock_extraction_llm):
    """
    Given a chunk containing two related concepts and a mocked extraction
    response,
    when extraction runs,
    the edge between the two concepts should have a non-empty relation label
    (e.g. is_a, part_of, or a freeform verb phrase).

    Source: Feature: Typed Relation Extraction — criterion 1; Issue 1 — criterion 2
    """
    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Machine Learning", "description": "..."},
                {"name": "Artificial Intelligence", "description": "..."},
            ],
            "relations": [
                {"source": "Machine Learning", "target": "Artificial Intelligence", "relation": "part_of"},
            ],
        }
    )
    chunk = Chunk(
        chunk_id="c4",
        text="Machine Learning is part of Artificial Intelligence.",
        source_file="file_d.md",
        section=None,
    )

    result = extract_from_chunk(chunk)

    assert len(result.relations) == 1
    assert result.relations[0]["relation"]


def test_relation_label_direction_matches_source_text_semantics(mock_extraction_llm):
    """
    Given a chunk stating a directional relation (e.g. "X is part of Y") and a
    mocked extraction response,
    when extraction runs,
    the produced edge direction (source -> target) should match the stated
    relation, not reversed.

    Source: Feature: Typed Relation Extraction — criterion 2
    """
    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Machine Learning", "description": "..."},
                {"name": "Artificial Intelligence", "description": "..."},
            ],
            "relations": [
                {"source": "Machine Learning", "target": "Artificial Intelligence", "relation": "part_of"},
            ],
        }
    )
    chunk = Chunk(
        chunk_id="c5",
        text="Machine Learning is part of Artificial Intelligence.",
        source_file="file_e.md",
        section=None,
    )

    result = extract_from_chunk(chunk)

    relation = result.relations[0]
    assert relation["source"] == "Machine Learning"
    assert relation["target"] == "Artificial Intelligence"


def test_no_forced_edge_when_no_relation_is_stated(mock_extraction_llm):
    """
    Given a chunk containing two unrelated concepts with no stated relation,
    when extraction runs,
    no edge should be created between the two concepts.

    Source: Feature: Typed Relation Extraction — criterion 3
    """
    mock_extraction_llm.set_response(
        {
            "concepts": [
                {"name": "Tectonic Plates", "description": "..."},
                {"name": "Sushi", "description": "..."},
            ],
            "relations": [],
        }
    )
    chunk = Chunk(
        chunk_id="c6",
        text="Tectonic plates move slowly. Sushi is a Japanese dish.",
        source_file="file_f.md",
        section=None,
    )

    result = extract_from_chunk(chunk)

    assert result.relations == []
