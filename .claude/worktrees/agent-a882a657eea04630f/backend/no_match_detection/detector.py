"""
No-match detection (Issue 12): a similarity-cutoff pre-filter over vector
seed scores, plus a thin wrapper delegating the Haiku-side borderline
relevance double-check to backend.clients.anthropic_client.judge_relevance.
Both stages live in this one module so no_match_detection owns the full
"is this actually answerable" decision end to end, per features.md's module
grouping (Similarity-Cutoff Pre-Filter + LLM Double-Check for Borderline
Relevance are both under "No-Match Detection").
"""
from backend.clients import anthropic_client

NOT_FOUND_MESSAGE = "No relevant document found for this query."


def passes_cutoff(seeds: list[dict], cutoff: float) -> bool:
    """
    Return True if any seed's score is at or below `cutoff`.

    Per backend_context.md decision #3, `score` is a Chroma L2 distance
    (lower means more similar), so a seed "passes" (is relevant enough to
    proceed to traversal) when `score <= cutoff`. Returns False if every
    seed's score is above cutoff, or if `seeds` is empty (nothing to seed
    traversal from at all).
    """
    return any(seed["score"] <= cutoff for seed in seeds)


def check_relevance(context: str, query: str) -> bool:
    """
    Thin wrapper delegating to anthropic_client.judge_relevance(context,
    query) - the Haiku-side double-check for borderline queries that passed
    the cutoff pre-filter but whose traversed context may not actually
    answer the question.
    """
    return anthropic_client.judge_relevance(context, query)
