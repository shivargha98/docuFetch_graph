"""
OpenRouter API client wrapper. OpenRouter exposes an OpenAI-chat-completions
-compatible endpoint, so this module uses the `openai` SDK pointed at
OpenRouter's base URL. Four logically distinct roles live here per the
project's architecture: concept/relation extraction (implemented, Issue 1),
text embedding (implemented, Issue 3), traversal-hop reasoning (implemented, Issue 10),
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


_TRAVERSAL_SYSTEM_PROMPT = (
    "You are guiding a bounded graph traversal over a concept graph to help "
    "answer a user's query. You are given the current concept node and a "
    "list of its neighboring edges (both outgoing and incoming). Decide "
    "which single neighbor, if any, is worth visiting next to help answer "
    "the query. Respond with ONLY JSON matching this schema, no other "
    'text: {"next_node_id": "<id>|null", "relation": "<label>|null"}. Set '
    "next_node_id (and relation) to null if none of the neighbors would "
    "help answer the query."
)


def traversal_next_hop(current_node: dict, neighbors: list[dict], query: str) -> dict:
    """
    Ask the traversal-reasoning model (OPENROUTER_LLM_MODEL, traversal role)
    which of `current_node`'s `neighbors` (if any) is worth visiting next
    during LLM-guided graph traversal, to help answer `query`.

    `current_node` is {"node_id", "name", "description"}; each entry in
    `neighbors` is {"node_id", "name", "relation", "direction"}
    ("direction" is "outgoing" or "incoming" relative to current_node).

    Returns a dict {"next_node_id": <id or None>, "relation": <label or
    None>}. If the API call fails, or the response isn't valid JSON or is
    otherwise malformed, the exception is caught and
    {"next_node_id": None, "relation": None} is returned instead (i.e. "stop
    traversing this branch"), so a single bad response only ends that branch
    of traversal rather than crashing the whole query.
    """
    try:
        user_content = json.dumps({"query": query, "current_node": current_node, "neighbors": neighbors})
        completion = _client.chat.completions.create(
            model=OPENROUTER_LLM_MODEL,
            messages=[
                {"role": "system", "content": _TRAVERSAL_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
        content = completion.choices[0].message.content
        decision = json.loads(content)
        next_node_id = decision.get("next_node_id") or None
        relation = decision.get("relation") or None
        return {"next_node_id": next_node_id, "relation": relation}
    except Exception:
        logger.exception("OpenRouter traversal_next_hop call failed or returned unparseable output")
        return {"next_node_id": None, "relation": None}


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
