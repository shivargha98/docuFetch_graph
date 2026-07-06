"""
Answer generation (Issue 11): thin wrapper around the Anthropic Haiku client
that produces a grounded 4-5 line answer from traversed graph/chunk context,
optionally incorporating prior chat turns for follow-up questions.
"""
from backend.clients import anthropic_client


def generate_answer(context: str, query: str, history: list[dict] | None = None) -> str:
    """
    Produce a 4-5 line answer to `query`, grounded in `context` (the
    traversed graph/chunk content), incorporating `history` (a list of
    {"query", "answer"} prior turns, possibly empty/None) as conversational
    context for follow-up questions.

    Thin wrapper delegating to backend.clients.anthropic_client.generate_answer,
    which does the actual prompt construction and Claude Haiku call.
    """
    return anthropic_client.generate_answer(context, query, history or [])
