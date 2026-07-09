"""
LLM client wrapper for the graph pipeline's per-chunk/per-hop roles. Four
logically distinct roles live here per the project's architecture:
concept/relation extraction (Issue 1), text embedding (Issue 3),
traversal-hop reasoning (Issue 10), and merge adjudication for entity
resolution's ambiguous band (Issue 5).

The three chat roles (extraction/traversal/adjudication) call the Anthropic
API directly with ANTHROPIC_MODEL (Claude Haiku) — swapped from OpenRouter
because the free-tier OpenRouter reasoning model returned empty content for
these prompts (see docs/backend/backend_context.md). Embeddings stay on
OpenRouter (OPENROUTER_EMBED_MODEL via the `openai` SDK pointed at
OpenRouter's base URL) since Anthropic has no embeddings API. The module
keeps its historical name because every call site and test fixture
monkeypatches functions on `backend.clients.openrouter_client`.
"""
import json
import logging

from anthropic import Anthropic
from openai import OpenAI

from backend.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, OPENROUTER_API_KEY, OPENROUTER_EMBED_MODEL

logger = logging.getLogger(__name__)

_client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)
_anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)

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


def embed_text(text: str) -> list[float]:
    """
    Return an embedding vector for `text` using OPENROUTER_EMBED_MODEL.

    Unlike extract_concepts, a failure here is NOT swallowed into an empty/
    zero-vector fallback: it propagates as an exception. A silently-returned
    zero vector would still get stored and matched against, quietly
    corrupting similarity search, whereas the caller (vector_store) can
    catch this per-chunk and simply skip storing that chunk's embedding,
    matching the ingestion pipeline's existing per-chunk resilience pattern.

    encoding_format="float" is required: without it the openai SDK silently
    requests base64-encoded embeddings, which OpenRouter's embed endpoint
    doesn't honor for this model — the response comes back with no data and
    the SDK raises ValueError("No embedding data received").
    """
    completion = _client.embeddings.create(model=OPENROUTER_EMBED_MODEL, input=text, encoding_format="float")
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
