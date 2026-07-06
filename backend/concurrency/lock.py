"""
Shared concurrency lock guarding graph_store + vector_store access (Issue
17), imported by both backend/ingestion/watcher.py (writes) and
backend/query_service.py (reads).

Decision: a plain threading.Lock, not an asyncio.Lock. The PRD's original
wording suggested "a simple asyncio.Lock (or reader-writer lock)", but our
actual runtime never has two coroutines racing inside the same asyncio event
loop over this state: the folder watcher's debounced callbacks run on real
watchdog/threading OS threads, and backend/api/ws_routes.py runs
answer_query via asyncio.to_thread (also a real OS thread from a thread
pool). An asyncio.Lock only safely coordinates coroutines awaiting within one
event loop, so it would not actually guard these threads against each other.
A plain threading.Lock is the correct primitive for this thread-based
concurrency model. A single mutual-exclusion lock (not a true reader-writer
lock with concurrent readers) is deliberately used instead of something more
elaborate, per the PRD's own rationale that brief lock contention is a
non-issue for a single-user personal tool. See backend_context.md for the
full recorded decision.
"""
import threading

GRAPH_LOCK = threading.Lock()
