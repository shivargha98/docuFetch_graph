"""
Unit tests for the answer_generation module: producing a grounded 4-5 line
answer via Claude Haiku, incorporating sliding-window session context.

Since `mock_haiku_client` monkeypatches the underlying
`anthropic_client.generate_answer` call (the layer that actually talks to
Claude and enforces grounding via its system prompt), these tests exercise
what `backend.answer_generation.answer.generate_answer`'s thin wrapper
actually controls: that context/query/history are passed through to the
client call unmodified, and that the wrapper itself introduces nothing extra.
Real prompt-level grounding enforcement lives in `anthropic_client`'s system
prompt, which isn't exercised by a mocked call.
"""
import pytest

from backend.answer_generation.answer import generate_answer


def test_relevant_context_produces_a_four_to_five_line_answer(mock_haiku_client):
    """
    Given traversed context relevant to a query and a mocked Haiku response,
    when the answer call runs,
    the returned answer should be 4-5 lines long.

    Source: Feature: Claude Haiku Summary Answer — criterion 1; Issue 11 — criterion 1
    """
    mock_haiku_client.set_response(
        "Photosynthesis converts sunlight into chemical energy.\n"
        "It occurs in the chloroplasts of plant cells.\n"
        "The process produces oxygen as a byproduct.\n"
        "It is foundational to most food chains on Earth."
    )

    answer = generate_answer(
        "Photosynthesis converts sunlight into chemical energy in plant cells.",
        "What is photosynthesis?",
    )

    lines = [line for line in answer.splitlines() if line.strip()]
    assert 4 <= len(lines) <= 5


def test_answer_content_is_grounded_in_traversed_context_only(mock_haiku_client):
    """
    Given traversed context with known, narrow content and a mocked Haiku
    response,
    when the answer call runs,
    the answer should not introduce content absent from the traversed context.

    Source: Feature: Claude Haiku Summary Answer — criterion 2; Issue 11 — criterion 2
    """
    context = "Photosynthesis converts sunlight into chemical energy in plant cells."
    mock_haiku_client.set_response(
        "Photosynthesis converts sunlight into chemical energy.\n"
        "This happens inside plant cells.\n"
        "No other topic is mentioned here.\n"
        "The answer stays within the given context."
    )

    answer = generate_answer(context, "What is photosynthesis?")

    assert "quantum" not in answer.lower()
    assert len(mock_haiku_client.calls) == 1
    passed_context, passed_query, _ = mock_haiku_client.calls[0]
    assert passed_context == context
    assert passed_query == "What is photosynthesis?"


def test_answer_call_incorporates_sliding_window_session_context(mock_haiku_client):
    """
    Given a session with prior turns and a new follow-up query,
    when the answer call is constructed,
    the prompt sent to Haiku should include the sliding-window session context
    alongside the current traversed context.

    Source: Feature: Claude Haiku Summary Answer — criterion 3
    """
    history = [
        {"query": "What is Machine Learning?", "answer": "It is a field of AI that learns from data."},
    ]
    mock_haiku_client.set_response("Follow-up answer line one.\nLine two.\nLine three.\nLine four.")

    generate_answer(
        "Machine Learning is part of Artificial Intelligence.",
        "What about AI?",
        history,
    )

    assert len(mock_haiku_client.calls) == 1
    passed_context, passed_query, passed_history = mock_haiku_client.calls[0]
    assert passed_history == history
    assert passed_query == "What about AI?"
    assert passed_context == "Machine Learning is part of Artificial Intelligence."
