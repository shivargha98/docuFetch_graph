"""
Unit tests for the answer_generation module: producing a grounded 4-5 line
answer via Claude Haiku, incorporating sliding-window session context.
"""
import pytest


def test_relevant_context_produces_a_four_to_five_line_answer(mock_haiku_client):
    """
    Given traversed context relevant to a query and a mocked Haiku response,
    when the answer call runs,
    the returned answer should be 4-5 lines long.

    Source: Feature: Claude Haiku Summary Answer — criterion 1; Issue 11 — criterion 1
    """
    raise NotImplementedError


def test_answer_content_is_grounded_in_traversed_context_only(mock_haiku_client):
    """
    Given traversed context with known, narrow content and a mocked Haiku
    response,
    when the answer call runs,
    the answer should not introduce content absent from the traversed context.

    Source: Feature: Claude Haiku Summary Answer — criterion 2; Issue 11 — criterion 2
    """
    raise NotImplementedError


def test_answer_call_incorporates_sliding_window_session_context(mock_haiku_client):
    """
    Given a session with prior turns and a new follow-up query,
    when the answer call is constructed,
    the prompt sent to Haiku should include the sliding-window session context
    alongside the current traversed context.

    Source: Feature: Claude Haiku Summary Answer — criterion 3
    """
    raise NotImplementedError
