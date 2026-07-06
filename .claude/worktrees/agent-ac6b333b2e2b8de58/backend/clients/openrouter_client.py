"""
OpenRouter API client wrapper. OpenRouter exposes an OpenAI-chat-completions
-compatible endpoint, so this module uses the `openai` SDK pointed at
OpenRouter's base URL. Three logically distinct roles live here per the
project's architecture: concept/relation extraction (implemented, Issue 1),
text embedding (stub, Issue 3), and traversal-hop reasoning (stub, Issue 10).
"""
import json
import logging

from openai import OpenAI

from backend.config import OPENROUTER_API_KEY, OPENROUTER_LLM_MODEL

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

    Not implemented yet - Issue 3 (vector store) will fill this in.
    """
    raise NotImplementedError


def traversal_next_hop(*args, **kwargs) -> dict:
    """
    Ask the traversal-reasoning model (OPENROUTER_LLM_MODEL, traversal role)
    which neighboring edge is worth following next during LLM-guided graph
    traversal.

    Not implemented yet - Issue 10 (retrieval/traversal) will fill this in.
    """
    raise NotImplementedError
