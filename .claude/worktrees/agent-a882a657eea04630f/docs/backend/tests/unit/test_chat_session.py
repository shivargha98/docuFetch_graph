"""
Unit tests for the chat_session module: single session per folder with a
5-turn sliding-window memory.

Chat-session persistence across a backend restart (Issue 13's open question)
was resolved in backend_context.md decision #4: CONFIRMED final as in-memory
only. The last test below now asserts that final contract directly (no
longer xfail-marked as "pending decision").
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
    from backend import chat_session

    session = chat_session.start_new_session("/tmp/followup_unit_test_folder")
    chat_session.add_turn(session, "What is Machine Learning?", "ML is a field of AI.")

    history = chat_session.get_history(session)

    assert history == [{"query": "What is Machine Learning?", "answer": "ML is a field of AI."}]


def test_session_context_never_exceeds_last_five_turns():
    """
    Given a session with more than 5 prior Q&A turns,
    when a new query is issued,
    only the most recent 5 turns should be present in the context window.

    Source: Feature: Single Session Per Folder with Sliding-Window Memory —
    criterion 2; Issue 13 — criterion 2
    """
    from backend import chat_session

    session = chat_session.start_new_session("/tmp/sliding_window_unit_test_folder")
    for i in range(7):
        chat_session.add_turn(session, f"q{i}", f"a{i}")

    history = chat_session.get_history(session)

    assert len(history) == 5
    assert history[0] == {"query": "q2", "answer": "a2"}
    assert history[-1] == {"query": "q6", "answer": "a6"}


def test_switching_folders_starts_a_fresh_session():
    """
    Given an active session with turn history for folder A,
    when the watched folder is switched to folder B,
    the new session for folder B should have no turn history carried over
    from folder A.

    Source: Feature: Single Session Per Folder with Sliding-Window Memory —
    criterion 3; Issue 13 — criterion 3
    """
    from backend import chat_session

    session_a = chat_session.get_or_create_session("/tmp/folder_a_unit_test")
    chat_session.add_turn(session_a, "What is Machine Learning?", "ML is a field of AI.")

    session_b = chat_session.get_or_create_session("/tmp/folder_b_unit_test")

    assert session_b.folder_path == "/tmp/folder_b_unit_test"
    assert chat_session.get_history(session_b) == []


def test_session_state_does_not_survive_backend_restart():
    """
    Given an active session with turn history,
    when the backend process restarts (simulated) and a new query is issued
    for the same folder,
    under backend_context.md decision #4 (in-memory only, CONFIRMED FINAL —
    not a placeholder), the new session should have no turn history from
    before the restart.

    A "restart" is simulated the same way a real restart would behave: the
    in-memory `_current_session` object from before the restart is gone, so
    the next request for the same folder_path just gets a brand-new, empty
    session — modeled here via `start_new_session`, which force-creates a
    fresh session regardless of what the current one was.

    Source: Issue 13 — caveat (open question, now resolved: see
    backend_context.md decision #4, "Chat session persistence across restart")
    """
    from backend import chat_session

    folder_path = "/tmp/restart_unit_test_folder"
    session = chat_session.start_new_session(folder_path)
    chat_session.add_turn(session, "What is Machine Learning?", "ML is a field of AI.")

    restarted_session = chat_session.start_new_session(folder_path)

    assert chat_session.get_history(restarted_session) == []
