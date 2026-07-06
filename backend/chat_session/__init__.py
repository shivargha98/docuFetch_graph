"""
Chat session package (Issue 13): a single in-memory, sliding-window (last 5
turns) chat session for the currently active watched folder. See session.py
for the implementation; re-exported here so callers can use
`chat_session.get_or_create_session(...)` etc. directly off the package.
"""
from backend.chat_session.session import (
    ChatSession,
    add_turn,
    get_history,
    get_or_create_session,
    start_new_session,
)

__all__ = ["ChatSession", "add_turn", "get_history", "get_or_create_session", "start_new_session"]
