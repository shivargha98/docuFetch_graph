"""
LLM client wrapper for the graph pipeline's per-chunk/per-hop roles. Four
logically distinct roles live here per the project's architecture:
concept/relation extraction (Issue 1), text embedding (Issue 3),
traversal-hop reasoning (Issue 10), and merge adjudication for entity
resolution's ambiguous band (Issue 5).

The three chat roles (extraction/traversal/adjudication) call the Anthropic
API directly with ANTHROPIC_MODEL (Claude Haiku) — swapped from OpenRouter
because the free-tier OpenRouter reasoning model returned empty content for
these prompts (see docs/backend/backend_context.md). Embeddings run LOCALLY
via fastembed (EMBED_MODEL, an ONNX model downloaded once on first use) —
swapped from hosted APIs (OpenRouter, then Gemini) whose free-tier rate
limits throttled ingestion; local CPU embedding is milliseconds per text
with no keys or quotas. The module keeps its historical name because every
call site and test fixture monkeypatches functions on
`backend.clients.openrouter_client`.
"""
import json
import logging
import math
from functools import lru_cache

from anthropic import Anthropic
from fastembed import TextEmbedding

from backend.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, EMBED_MODEL

logger = logging.getLogger(__name__)

_anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)

# Lazily constructed on first embed: TextEmbedding() loads (and on the very
# first run downloads) the ONNX model — seconds of work that must not happen
# at import time (server boot, test collection).
_embedding_model: TextEmbedding | None = None


def _get_embedding_model() -> TextEmbedding:
    """Return the process-wide fastembed model, constructing it on first use."""
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = TextEmbedding(model_name=EMBED_MODEL)
    return _embedding_model

_EXTRACTION_SYSTEM_PROMPT = (
    "You extract concepts and typed relations from a piece of text. "
    "Respond with ONLY JSON matching this schema, no other text: "
    '{"concepts": [{"name": str, "description": str}], '
    '"relations": [{"source": str, "target": str, "relation": str}]}. '
    "source/target in relations must refer to concept names listed in "
    "concepts. Only include a relation when the text actually states one."
)

# Structured-output schemas for the three chat roles: Claude wraps free-form
# JSON answers in markdown fences, so each call constrains the response via
# output_config.format instead of trusting the prompt alone — the API then
# guarantees bare, schema-valid JSON.
_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "concepts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "description": {"type": "string"}},
                "required": ["name", "description"],
                "additionalProperties": False,
            },
        },
        "relations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source": {"type": "string"},
                    "target": {"type": "string"},
                    "relation": {"type": "string"},
                },
                "required": ["source", "target", "relation"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["concepts", "relations"],
    "additionalProperties": False,
}

_TRAVERSAL_SCHEMA = {
    "type": "object",
    "properties": {
        "next_node_id": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "relation": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    },
    "required": ["next_node_id", "relation"],
    "additionalProperties": False,
}

_ADJUDICATION_SCHEMA = {
    "type": "object",
    "properties": {"merge": {"type": "boolean"}},
    "required": ["merge"],
    "additionalProperties": False,
}


def extract_concepts(chunk_text: str) -> dict:
    """
    Ask the extraction model (ANTHROPIC_MODEL, Claude Haiku) for concept
    names/descriptions and typed relations found in chunk_text.

    Returns a dict shaped like {"concepts": [...], "relations": [...]}. If the
    API call fails or the response isn't valid JSON, the exception is caught
    and {"concepts": [], "relations": []} is returned instead, so the caller
    can skip this chunk without crashing the ingestion run.
    """
    try:
        completion = _anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=2048,
            system=_EXTRACTION_SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": _EXTRACTION_SCHEMA}},
            messages=[{"role": "user", "content": chunk_text}],
        )
        content = completion.content[0].text
        return json.loads(content)
    except Exception:
        logger.exception("Anthropic extract_concepts call failed or returned unparseable output")
        return {"concepts": [], "relations": []}


@lru_cache(maxsize=8192)
def _embed_text_uncached(text: str) -> tuple[float, ...]:
    """
    Compute + unit-normalize the embedding for `text` (cached by exact text).

    The cache exists because entity resolution re-embeds every node's
    "{name}: {description}" text on every per-file resolve_all pass — the
    cache collapses those repeats to one computation each. Exceptions are
    never cached (lru_cache only stores successful returns).
    """
    vector = [float(component) for component in next(iter(_get_embedding_model().embed([text])))]
    norm = math.sqrt(sum(component * component for component in vector))
    return tuple(component / norm for component in vector) if norm else tuple(vector)


def clear_embedding_cache() -> None:
    """Drop all cached embeddings (used by tests; harmless in production)."""
    _embed_text_uncached.cache_clear()


def embed_text(text: str) -> list[float]:
    """
    Return a unit-normalized embedding vector for `text`, computed locally
    by the fastembed EMBED_MODEL. Identical texts are served from an
    in-process cache (see _embed_text_uncached); each call returns a fresh
    list, so callers may mutate their copy.

    Unlike extract_concepts, a failure here is NOT swallowed into an empty/
    zero-vector fallback: it propagates as an exception. A silently-returned
    zero vector would still get stored and matched against, quietly
    corrupting similarity search, whereas callers contain the failure per
    chunk/file (vector_store, diff_scan's per-file guard).

    The vector is normalized defensively (most fastembed models already
    emit unit vectors): NO_MATCH_SIMILARITY_CUTOFF and the entity-resolution
    bands assume Chroma's squared-L2 over unit vectors (= 2 - 2*cosine).
    """
    return list(_embed_text_uncached(text))


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
    Ask the traversal-reasoning model (ANTHROPIC_MODEL, traversal role)
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
        completion = _anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=100,
            system=_TRAVERSAL_SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": _TRAVERSAL_SCHEMA}},
            messages=[{"role": "user", "content": user_content}],
        )
        content = completion.content[0].text
        decision = json.loads(content)
        next_node_id = decision.get("next_node_id") or None
        relation = decision.get("relation") or None
        return {"next_node_id": next_node_id, "relation": relation}
    except Exception:
        logger.exception("Anthropic traversal_next_hop call failed or returned unparseable output")
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
    Ask the adjudication model (ANTHROPIC_MODEL, Claude Haiku) whether
    concept_a and concept_b (each a dict with "name"/"description" keys)
    refer to the same real-world thing and should be merged, for entity
    resolution's ambiguous embedding-similarity band (Issue 5).

    Returns a dict shaped like {"merge": bool}. If the API call fails or the
    response isn't valid JSON, the exception is caught and {"merge": False}
    is returned instead, so a malformed adjudication response doesn't crash
    resolution or force an incorrect merge.
    """
    try:
        completion = _anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=50,
            system=_ADJUDICATION_SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": _ADJUDICATION_SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": json.dumps({"concept_a": concept_a, "concept_b": concept_b}),
                },
            ],
        )
        content = completion.content[0].text
        return json.loads(content)
    except Exception:
        logger.exception("Anthropic adjudicate_merge call failed or returned unparseable output")
        return {"merge": False}
