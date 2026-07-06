"""
Concurrency package (Issue 17): a single shared lock guarding graph_store and
vector_store access between ingestion writes and chat-query reads. See
lock.py for the lock instance and the reasoning behind choosing a plain
threading.Lock over an asyncio.Lock.
"""
from backend.concurrency.lock import GRAPH_LOCK

__all__ = ["GRAPH_LOCK"]
