"""
Concept + typed-relation extraction from a single chunk of text. Delegates
the actual LLM call to backend.clients.openrouter_client.extract_concepts and
normalizes its response into an ExtractionResult, never raising out to the
ingestion pipeline even when the underlying call returns malformed data.
"""
import logging
from dataclasses import dataclass, field

from backend.clients import openrouter_client
from backend.ingestion.chunking import Chunk

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """Concepts and typed relations extracted from a single chunk."""

    concepts: list[dict] = field(default_factory=list)
    relations: list[dict] = field(default_factory=list)


def extract_from_chunk(chunk: Chunk) -> ExtractionResult:
    """
    Run concept/relation extraction on a single chunk's text.

    Calls backend.clients.openrouter_client.extract_concepts and converts its
    dict response into an ExtractionResult. If the call raises, or returns a
    response missing/malforming the expected "concepts"/"relations" keys,
    the problem is logged and an empty ExtractionResult is returned instead of
    propagating the error, so a malformed response for one chunk cannot abort
    the rest of the ingestion run.
    """
    try:
        response = openrouter_client.extract_concepts(chunk.text)
        concepts = response.get("concepts", [])
        relations = response.get("relations", [])
        if not isinstance(concepts, list) or not isinstance(relations, list):
            raise ValueError("extract_concepts response has non-list concepts/relations")
        return ExtractionResult(concepts=concepts, relations=relations)
    except Exception:
        logger.exception("Extraction failed for chunk %s; returning empty result", chunk.chunk_id)
        return ExtractionResult(concepts=[], relations=[])
