"""
Anthropic Claude client. `generate_answer` (Issue 11, implemented) calls
ANTHROPIC_MODEL (Claude Haiku) to produce the final user-facing answer.
`judge_relevance` (Issue 12, implemented) calls the same model to
double-check whether traversed context actually answers a borderline query.
"""
import logging

from anthropic import Anthropic

from backend.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL

logger = logging.getLogger(__name__)

_client = Anthropic(api_key=ANTHROPIC_API_KEY)

_ANSWER_SYSTEM_PROMPT = (
    "You answer a user's question in 4-5 lines, grounded ONLY in the "
    "provided context. Do not introduce information absent from the "
    "context - no free-form knowledge beyond what the context states. If "
    "prior conversation turns are provided, use them only to resolve "
    "follow-up questions (e.g. pronouns or \"what about X\"), not as a "
    "source of new facts."
)


def generate_answer(context: str, query: str, history: list[dict]) -> str:
    """
    Produce a 4-5 line answer to `query`, grounded in `context` (the
    traversed graph/chunk content) via ANTHROPIC_MODEL (Claude Haiku).

    `history` is a list of {"query": str, "answer": str} prior turns
    (possibly empty); when present, it's included in the prompt as
    conversational context so follow-up questions resolve correctly, but the
    system prompt instructs the model not to treat it as a source of new
    facts. Returns the response text.
    """
    history_text = "\n".join(f"Q: {turn['query']}\nA: {turn['answer']}" for turn in history)
    user_content = (
        (f"Prior conversation:\n{history_text}\n\n" if history_text else "")
        + f"Context:\n{context}\n\nQuestion: {query}"
    )
    completion = _client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=300,
        system=_ANSWER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    return completion.content[0].text


_RELEVANCE_SYSTEM_PROMPT = (
    "You judge whether a piece of context is topically relevant to a user's "
    "question and contains information useful for answering it, even if "
    "only partially, indirectly, or by requiring simple inference (e.g. "
    "comparing dates mentioned in the context to answer a \"newest\"/"
    "\"latest\" question). Respond with exactly one word: RELEVANT if the "
    "context is on-topic and could help answer the question, or "
    "NOT_RELEVANT only if the context is about a genuinely different topic "
    "and gives no useful information toward answering the question. Do not "
    "include any other text."
)


def judge_relevance(context: str, query: str) -> bool:
    """
    Ask Claude Haiku whether `context` substantively answers `query`, used as
    the double-check stage of no-match detection (Issue 12).

    Prompt/response contract: the model is instructed to reply with exactly
    one word, "RELEVANT" or "NOT_RELEVANT" (see _RELEVANCE_SYSTEM_PROMPT).
    The response text is checked for "NOT_RELEVANT" first (since it contains
    "RELEVANT" as a substring) - any response containing "NOT_RELEVANT"
    is treated as False, everything else as True. No try/except here,
    consistent with generate_answer's existing precedent of not swallowing
    exceptions from the Anthropic call.
    """
    user_content = f"Context:\n{context}\n\nQuestion: {query}"
    completion = _client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=10,
        system=_RELEVANCE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    verdict = completion.content[0].text
    return "NOT_RELEVANT" not in verdict.upper()
