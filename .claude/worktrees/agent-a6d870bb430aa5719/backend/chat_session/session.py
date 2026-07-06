"""
In-memory chat session with 5-turn sliding-window memory (Issue 13). Per
backend_context.md decision #4, this is a final, non-placeholder design:
exactly one ongoing session exists at a time, scoped to whichever folder is
currently active; no disk persistence. Switching to a different folder path
always creates a fresh, empty session.
"""
from collections import deque
from dataclasses import dataclass, field


@dataclass
class ChatSession:
    """An in-memory chat session for one watched folder, holding at most the last 5 Q&A turns."""

    folder_path: str
    turns: deque = field(default_factory=lambda: deque(maxlen=5))


_current_session: ChatSession | None = None


def get_or_create_session(folder_path: str) -> ChatSession:
    """
    Return the current session if it exists and matches `folder_path`;
    otherwise create and store a fresh, empty `ChatSession` for
    `folder_path`. A folder switch therefore always yields an empty session,
    with no turn history carried over from the previous folder.
    """
    global _current_session
    if _current_session is not None and _current_session.folder_path == folder_path:
        return _current_session
    _current_session = ChatSession(folder_path)
    return _current_session


def start_new_session(folder_path: str) -> ChatSession:
    """
    Force-create and store a fresh, empty session for `folder_path`, even if
    it matches the current session's folder path. For explicit resets (e.g.
    Round 5's folder-config endpoint switching folders, including a no-op
    "switch to the same path" case).
    """
    global _current_session
    _current_session = ChatSession(folder_path)
    return _current_session


def add_turn(session: ChatSession, query: str, answer: str) -> None:
    """
    Append a {"query", "answer"} turn to `session.turns`. Since `turns` is a
    `deque(maxlen=5)`, appending past 5 turns automatically drops the oldest.
    """
    session.turns.append({"query": query, "answer": answer})


def get_history(session: ChatSession) -> list[dict]:
    """Return `session.turns` as a plain list, oldest turn first."""
    return list(session.turns)
