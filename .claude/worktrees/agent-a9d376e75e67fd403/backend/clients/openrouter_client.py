"""
OpenRouter API client wrapper. OpenRouter exposes an OpenAI-chat-completions
-compatible endpoint, so this module uses the `openai` SDK pointed at
OpenRouter's base URL. Four logically distinct roles live here per the
project's architecture: concept/relation extraction (implemented, Issue 1),
text embedding (implemented, Issue 3), traversal-hop reasoning (stub, Issue 10),
and merge adjudication for entity resolution's ambiguous band (implemented, Issue 5).
"""
import json
import logging

from openai import OpenAI

from backend.config import OPENROUTER_API_KEY, OPENROUTER_EMBED_MODEL, OPENROUTER_LLM_MODEL

logger = logging.getLogger(__name__)

_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)

_EXTRACTION_SYSTEM_PROMPT = (
    "You extract concepts and typed relations from a piece of text. "
    "Respond with ONLY JSON matching this schema, no other text: "
    '{"concepts": [{"name": str, "description": str}], '
    '"relations": [{"source": str, "target": str, "relation": str}]}. '
    "source/target in relations must refer to concept names listed in "
    "concepts. Only include a relation when the text actually states one."
)


def extract_concepts(chunk_text: str) -> dict:
    """
    Ask the OpenRouter extraction model (OPENROUTER_LLM_MODEL) for concept
    names/descriptions and typed relations found in chunk_text.

    Returns a dict shaped like {"concepts": [...], "relations": [...]}. If the
    API call fails or the response isn't valid JSON, the exception is caught
    and {"concepts": [], "relations": []} is returned instead, so the caller
    can skip this chunk without crashing the ingestion run.
    """
    try:
        completion = _client.chat.completions.create(
            model=OPENROUTER_LLM_MODEL,
            messages=[
                {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": chunk_text},
            ],
        )
        content = completion.choices[0].message.content
        return json.loads(content)
    except Exception:
        logger.exception("OpenRouter extract_concepts call failed or returned unparseable output")
        return {"concepts": [], "relations": []}


def embed_text(text: str) -> list[float]:
    """
    Return an embedding vector for `text` using OPENROUTER_EMBED_MODEL.

    Unlike extract_concepts, a failure here is NOT swallowed into an empty/
    zero-vector fallback: it propagates as an exception. A silently-returned
    zero vector would still get stored and matched against, quietly
    corrupting similarity search, whereas the caller (vector_store) can
    catch this per-chunk and simply skip storing that chunk's embedding,
    matching the ingestion pipeline's existing per-chunk resilience pattern.
    """
    completion = _client.embeddings.create(model=OPENROUTER_EMBED_MODEL, input=text)
    return completion.data[0].embedding


def traversal_next_hop(*args, **kwargs) -> dict:
    """
    Ask the traversal-reasoning model (OPENROUTER_LLM_MODEL, traversal role)
    which neighboring edge is worth following next during LLM-guided graph
    traversal.

    Not implemented yet - Issue 10 (retrieval/traversal) will fill this in.
    """
    raise NotImplementedError


_ADJUDICATION_SYSTEM_PROMPT = (
    "You decide whether two candidate concepts, each extracted from a "
    "possibly different document, refer to the same real-world thing and "
    "should be merged into a single concept node in a knowledge graph. "
    "Respond with ONLY JSON matching this schema, no other text: "
    '{"merge": bool}.'
)


def adjudicate_merge(concept_a: dict, concept_b: dict) -> dict:
    """
    Ask the OpenRouter model (OPENROUTER_LLM_MODEL) whether concept_a and
    concept_b (each a dict with "name"/"description" keys) refer to the same
    real-world thing and should be merged, for entity resolution's ambiguous
    embedding-similarity band (Issue 5).

    Returns a dict shaped like {"merge": bool}. If the API call fails or the
    response isn't valid JSON, the exception is caught and {"merge": False}
    is returned instead, so a malformed adjudication response doesn't crash
    resolution or force an incorrect merge.
    """
    try:
        completion = _client.chat.completions.create(
            model=OPENROUTER_LLM_MODEL,
            messages=[
                {"role": "system", "content": _ADJUDICATION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps({"concept_a": concept_a, "concept_b": concept_b}),
                },
            ],
        )
        content = completion.choices[0].message.content
        return json.loads(content)
    except Exception:
        logger.exception("OpenRouter adjudicate_merge call failed or returned unparseable output")
        return {"merge": False}
