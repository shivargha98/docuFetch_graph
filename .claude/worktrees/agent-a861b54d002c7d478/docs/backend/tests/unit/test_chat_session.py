"""
Unit tests for the chat_session module: single session per folder with a
5-turn sliding-window memory.

OPEN QUESTION (Issue 13): whether session state persists across a backend
restart is unresolved. The PRD's stated default is in-memory only; the last
test below asserts that default and is marked xfail so it gets revisited (not
silently treated as final) once persistence is explicitly decided.
"""
import pytest


def test_followup_question_has_prior_turn_available_as_context():
    """
    Given a session with one prior Q&A turn,
    when a follow-up query is issued referencing that turn,
    the prior turn's content should be present in the context passed to
    seeding and answer generation.

    Source: Feature: Single Session Per Folder with Sliding-Window Memory —
    criterion 1; Issue 13 — criterion 1
    """
    raise NotImplementedError


def test_session_context_never_exceeds_last_five_turns():
    """
    Given a session with more than 5 prior Q&A turns,
    when a new query is issued,
    only the most recent 5 turns should be present in the context window.

    Source: Feature: Single Session Per Folder with Sliding-Window Memory —
    criterion 2; Issue 13 — criterion 2
    """
    raise NotImplementedError


def test_switching_folders_starts_a_fresh_session():
    """
    Given an active session with turn history for folder A,
    when the watched folder is switched to folder B,
    the new session for folder B should have no turn history carried over
    from folder A.

    Source: Feature: Single Session Per Folder with Sliding-Window Memory —
    criterion 3; Issue 13 — criterion 3
    """
    raise NotImplementedError


@pytest.mark.xfail(
    reason="OPEN QUESTION (Issue 13): chat-session persistence across restart "
    "is unresolved; this documents today's assumed default (in-memory only) "
    "and must be revisited once a persistence decision is made.",
    strict=False,
)
def test_session_state_does_not_survive_backend_restart():
    """
    Given an active session with turn history,
    when the backend process restarts (simulated) and a new query is issued
    for the same folder,
    under the PRD's stated default (in-memory only) the new session should
    have no turn history from before the restart.

    OPEN QUESTION (Issue 13): revisit once persistence-across-restart is
    explicitly decided — this test encodes only today's default assumption.

    Source: Issue 13 — caveat (open question: chat persistence across restart)
    """
    raise NotImplementedError
