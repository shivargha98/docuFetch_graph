"""
Anthropic Claude client stubs. `generate_answer` (Issue 11) and
`judge_relevance` (Issue 12) will call ANTHROPIC_MODEL (Claude Haiku) to
produce the final user-facing answer and adjudicate borderline relevance.
Not exercised by any Issue 1 test - stubbed here now so this module exists
and later rounds' imports don't break.
"""


def generate_answer(context: str, query: str, history: list[dict]) -> str:
    """
    Produce a 4-5 line answer to `query`, grounded in `context` (the traversed
    graph/chunk content) and `history` (prior chat turns), via ANTHROPIC_MODEL.

    Not implemented yet - Issue 11 (Haiku summary answer) will fill this in.
    """
    raise NotImplementedError


def judge_relevance(context: str, query: str) -> bool:
    """
    Ask Claude Haiku whether `context` substantively answers `query`, used as
    the double-check stage of no-match detection.

    Not implemented yet - Issue 12 (no-match detection) will fill this in.
    """
    raise NotImplementedError
