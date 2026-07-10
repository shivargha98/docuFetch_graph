"""
Unit tests for embed_text's in-process cache: entity resolution re-embeds
every node's "{name}: {description}" text on every per-file resolve_all pass,
so identical text must be computed once. Also covers mutation isolation and
that failures are never cached. The fastembed model object is faked (no
model download in tests).
Also covers the adjudication-verdict cache: entity resolution re-compares
the same ambiguous pairs on repeated passes, and each uncached verdict costs
a real Haiku call.
"""
from types import SimpleNamespace

from backend.clients import openrouter_client


class _CountingEmbeddingModel:
    """Stands in for the fastembed TextEmbedding model, counting embed calls."""

    def __init__(self):
        self.calls = 0

    def embed(self, texts):
        self.calls += 1
        return iter([[3.0, 4.0]])


def test_embed_text_caches_identical_texts(monkeypatch):
    """Given the same text embedded twice, the model is invoked once."""
    fake = _CountingEmbeddingModel()
    monkeypatch.setattr(openrouter_client, "_embedding_model", fake)
    openrouter_client.clear_embedding_cache()

    first = openrouter_client.embed_text("Alpha: the first concept")
    second = openrouter_client.embed_text("Alpha: the first concept")

    assert fake.calls == 1
    # Unit-normalized ([3,4] -> [0.6, 0.8]) and equal across calls.
    assert first == second
    assert abs(sum(c * c for c in first) - 1.0) < 1e-9


def test_embed_text_returns_independent_lists(monkeypatch):
    """A caller mutating its returned vector must not corrupt the cache."""
    fake = _CountingEmbeddingModel()
    monkeypatch.setattr(openrouter_client, "_embedding_model", fake)
    openrouter_client.clear_embedding_cache()

    first = openrouter_client.embed_text("Beta: another concept")
    first[0] = 999.0
    second = openrouter_client.embed_text("Beta: another concept")

    assert second[0] != 999.0
    assert fake.calls == 1


def test_embed_text_failures_are_not_cached(monkeypatch):
    """A failed computation must not poison the cache: the next attempt retries."""

    class _FailingModel:
        def __init__(self):
            self.calls = 0

        def embed(self, texts):
            self.calls += 1
            raise RuntimeError("simulated model failure")

    failing = _FailingModel()
    monkeypatch.setattr(openrouter_client, "_embedding_model", failing)
    openrouter_client.clear_embedding_cache()

    try:
        openrouter_client.embed_text("Gamma: a concept")
    except RuntimeError:
        pass
    assert failing.calls == 1

    # Restore a working model: the retry must recompute (not a cached error).
    working = _CountingEmbeddingModel()
    monkeypatch.setattr(openrouter_client, "_embedding_model", working)
    result = openrouter_client.embed_text("Gamma: a concept")
    assert working.calls == 1
    assert abs(sum(c * c for c in result) - 1.0) < 1e-9


class _CountingAnthropicClient:
    """Stands in for the Anthropic client, counting messages.create calls."""

    def __init__(self, text='{"merge": true}'):
        self.calls = 0
        self.text = text
        self.messages = self

    def create(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(content=[SimpleNamespace(text=self.text)])


def test_adjudicate_merge_caches_verdicts_per_pair(monkeypatch):
    """The same concept pair (either order) is adjudicated once."""
    fake = _CountingAnthropicClient()
    monkeypatch.setattr(openrouter_client, "_anthropic_client", fake)
    openrouter_client.clear_adjudication_cache()

    a = {"name": "LLM", "description": "large language model"}
    b = {"name": "Large Language Model", "description": "a neural network"}

    first = openrouter_client.adjudicate_merge(a, b)
    second = openrouter_client.adjudicate_merge(b, a)  # reversed order

    assert fake.calls == 1
    assert first == {"merge": True}
    assert second == {"merge": True}


def test_adjudicate_merge_error_fallbacks_are_not_cached(monkeypatch):
    """A failed call returns the safe default but must not poison the cache."""
    failing = _CountingAnthropicClient()

    def boom(**kwargs):
        failing.calls += 1
        raise RuntimeError("simulated API failure")

    failing.create = boom
    monkeypatch.setattr(openrouter_client, "_anthropic_client", failing)
    openrouter_client.clear_adjudication_cache()

    a = {"name": "A", "description": "a"}
    b = {"name": "B", "description": "b"}
    assert openrouter_client.adjudicate_merge(a, b) == {"merge": False}
    assert failing.calls == 1

    working = _CountingAnthropicClient()
    monkeypatch.setattr(openrouter_client, "_anthropic_client", working)
    assert openrouter_client.adjudicate_merge(a, b) == {"merge": True}
    assert working.calls == 1
