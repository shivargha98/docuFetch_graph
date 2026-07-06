"""
Tiered entity resolution pipeline (Issues 4 + 5). Merges duplicate/synonymous
concept nodes across ingested files in two tiers, run in order:

1. String-match tier (Issue 4): nodes whose names are identical once
   normalized (case/whitespace/simple-pluralization) but whose ids differ
   (e.g. "Neural Network" vs "Neural Networks", which slugify into different
   node ids) are merged with no embedding/LLM involvement at all.
2. Embedding-similarity + LLM-adjudication tier (Issue 5): for nodes
   remaining after the string tier, cosine similarity between embeddings of
   each node's "{name}: {description}" text decides the outcome: similarity
   at/above `merge_threshold` merges automatically, similarity in the
   `[ambiguous_low, merge_threshold)` band is decided by an LLM adjudication
   call, and similarity below `ambiguous_low` is left unmerged.

All actual graph mutation is delegated to `GraphStore.merge_nodes`, which
already unions source_files, redirects edges, and removes the merged-away
node (see backend/graph_store/store.py) - this module only decides *which*
pairs to merge.
"""
import math

from backend.clients import openrouter_client
from backend.config import ENTITY_RESOLUTION_AMBIGUOUS_LOW, ENTITY_RESOLUTION_MERGE_THRESHOLD
from backend.graph_store.store import GraphStore


def normalize_name(name: str) -> str:
    """
    Normalize a concept name for string-tier comparison: lowercase, strip
    leading/trailing whitespace, collapse internal whitespace runs to a
    single space, and strip one trailing simple plural "s" (only when the
    normalized string is longer than 3 characters, to avoid mangling short
    words).

    This function's job is specifically to catch what
    `graph_store.store._slugify` does NOT catch: `_slugify` already
    lowercases/strips whitespace/punctuation when deriving node ids, so two
    mentions differing only by case/whitespace already collapse to the same
    node during ingestion. Simple pluralization differences (e.g. "Neural
    Networks" vs "Neural Network") still produce genuinely different slugs
    ("concept_neural_networks" vs "concept_neural_network") - this heuristic
    catches those so the string-match tier can merge them.
    """
    normalized = " ".join(name.strip().lower().split())
    if len(normalized) > 3 and normalized.endswith("s"):
        normalized = normalized[:-1]
    return normalized


def find_string_tier_merges(graph_store: GraphStore) -> list[tuple[str, str]]:
    """
    Compare every pair of nodes' normalize_name(data["name"]) and return
    (keep_id, merge_id) pairs where the normalized names match but the node
    ids differ. Pure string comparison - no embeddings or LLM calls
    involved. Each node is proposed as a merge-away (`merge_id`) at most once
    per call, so a node already queued to merge into an earlier "keep" node
    is skipped as a candidate for a later pair.
    """
    nodes = list(graph_store.graph.nodes(data=True))
    merges: list[tuple[str, str]] = []
    already_queued: set[str] = set()

    for i in range(len(nodes)):
        keep_id, keep_data = nodes[i]
        if keep_id in already_queued:
            continue
        for j in range(i + 1, len(nodes)):
            merge_id, merge_data = nodes[j]
            if merge_id in already_queued:
                continue
            if normalize_name(keep_data["name"]) == normalize_name(merge_data["name"]):
                merges.append((keep_id, merge_id))
                already_queued.add(merge_id)

    return merges


def resolve_string_tier(graph_store: GraphStore) -> list[tuple[str, str]]:
    """
    Find all string-tier merges (see find_string_tier_merges) and apply each
    via `graph_store.merge_nodes(keep_id, merge_id)`. Returns the list of
    (keep_id, merge_id) merges actually applied.
    """
    merges = find_string_tier_merges(graph_store)
    for keep_id, merge_id in merges:
        graph_store.merge_nodes(keep_id, merge_id)
    return merges


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Plain-Python cosine similarity between two equal-length numeric vectors:
    (sum of elementwise products) / (sqrt(sum of squares of a) * sqrt(sum of
    squares of b)). Returns 0.0 if either vector has zero magnitude, to avoid
    dividing by zero.
    """
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def resolve_embedding_tier(
    graph_store: GraphStore,
    merge_threshold: float = ENTITY_RESOLUTION_MERGE_THRESHOLD,
    ambiguous_low: float = ENTITY_RESOLUTION_AMBIGUOUS_LOW,
) -> list[tuple[str, str]]:
    """
    For every remaining pair of nodes currently in `graph_store` (intended to
    be called after `resolve_string_tier`, though it operates on whatever
    nodes are present regardless of ordering), embed each node's
    "{name}: {description}" text via `openrouter_client.embed_text` and
    compare cosine similarity:
      - similarity >= merge_threshold: merge via `graph_store.merge_nodes`,
        no LLM call.
      - ambiguous_low <= similarity < merge_threshold: ask
        `openrouter_client.adjudicate_merge(concept_a, concept_b)`; merge
        only if it returns {"merge": True}.
      - similarity < ambiguous_low: leave separate, no LLM call.

    Returns the list of (keep_id, merge_id) merges actually applied. Each
    node is merged away at most once per call (mirrors
    find_string_tier_merges's rule) so it isn't compared again after being
    removed from the graph.
    """
    nodes = list(graph_store.graph.nodes(data=True))
    embeddings = {
        node_id: openrouter_client.embed_text(f"{data['name']}: {data['description']}")
        for node_id, data in nodes
    }

    merges: list[tuple[str, str]] = []
    already_merged: set[str] = set()

    for i in range(len(nodes)):
        keep_id, keep_data = nodes[i]
        if keep_id in already_merged:
            continue
        for j in range(i + 1, len(nodes)):
            merge_id, merge_data = nodes[j]
            if merge_id in already_merged:
                continue

            similarity = _cosine_similarity(embeddings[keep_id], embeddings[merge_id])

            should_merge = False
            if similarity >= merge_threshold:
                should_merge = True
            elif ambiguous_low <= similarity < merge_threshold:
                decision = openrouter_client.adjudicate_merge(keep_data, merge_data)
                should_merge = bool(decision.get("merge", False))

            if should_merge:
                graph_store.merge_nodes(keep_id, merge_id)
                merges.append((keep_id, merge_id))
                already_merged.add(merge_id)

    return merges


def resolve_all(
    graph_store: GraphStore,
    merge_threshold: float = ENTITY_RESOLUTION_MERGE_THRESHOLD,
    ambiguous_low: float = ENTITY_RESOLUTION_AMBIGUOUS_LOW,
) -> None:
    """
    Run the full tiered resolution pipeline against `graph_store`: the
    string-match tier first, then the embedding-similarity/LLM-adjudication
    tier on whatever nodes remain. Intended to be invoked after ingesting a
    batch of files (e.g. by the folder watcher, or directly by an
    integration test) - this is a cross-file/whole-graph operation, not a
    per-file pipeline.py hook.
    """
    resolve_string_tier(graph_store)
    resolve_embedding_tier(graph_store, merge_threshold=merge_threshold, ambiguous_low=ambiguous_low)
