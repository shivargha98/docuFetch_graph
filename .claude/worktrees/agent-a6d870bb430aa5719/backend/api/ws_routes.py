"""
WebSocket traversal-step streaming route (Issue 14). Exposes a `/ws/chat`
websocket endpoint that accepts one chat query at a time and streams back
each graph-traversal step live as it happens (not a single batched dump at
the end), followed by a distinct completion event and then exactly one
answer/no-match event, per the finalized event schema in
docs/backend/backend_context.md decision #5. Errors during a query are
reported as an `error` event without closing the connection, so the next
query on the same socket can still be served.
"""
import asyncio
from pathlib import Path

from fastapi import APIRouter, WebSocket

import backend.config as config
from backend.graph_store.store import GraphStore
from backend.query_service import answer_query
from backend.vector_store.store import VectorStore

router = APIRouter()


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket) -> None:
    """
    Accept a websocket connection and loop, receiving one
    `{"query": "<text>"}` message at a time.

    For each query: load the current graph (fresh from
    `config.GRAPH_STORE_PATH`, same pattern as `graph_routes.py`, empty
    `GraphStore()` if nothing has been persisted yet) and a fresh
    `VectorStore()`, then run `answer_query` in a background thread via
    `asyncio.to_thread` so its synchronous `on_visit` callback can stream a
    `visit_node` event over the socket for each traversal step as it happens.
    The callback bridges the background thread back onto this coroutine's
    event loop via `loop.call_soon_threadsafe` and an `asyncio.Queue`; a
    sentinel `None` is pushed onto the queue once the background thread
    finishes (success or error) so the streaming loop here knows when to
    stop pulling from it.

    After all `visit_node` events, sends one `traversal_complete` event, then
    exactly one of `answer` or `no_match`. Any exception raised anywhere in
    this flow is caught and reported as an `error` event, and the outer loop
    continues so one bad query doesn't close the connection.
    """
    await websocket.accept()
    while True:
        try:
            message = await websocket.receive_json()
        except Exception:
            break

        try:
            query = message["query"]

            graph_path = Path(config.GRAPH_STORE_PATH)
            graph_store = GraphStore.load(graph_path) if graph_path.exists() else GraphStore()
            vector_store = VectorStore()

            loop = asyncio.get_running_loop()
            queue: asyncio.Queue = asyncio.Queue()

            def on_visit(step: dict) -> None:
                """Thread-safe bridge: push a traversal step from the background thread onto the event loop's queue."""
                loop.call_soon_threadsafe(queue.put_nowait, step)

            async def run_query() -> dict:
                """Run answer_query in a background thread, pushing a sentinel onto the queue when it's done (success or error)."""
                try:
                    return await asyncio.to_thread(
                        answer_query, query, graph_store, vector_store, "default", None, on_visit
                    )
                finally:
                    loop.call_soon_threadsafe(queue.put_nowait, None)

            task = asyncio.create_task(run_query())

            while True:
                step = await queue.get()
                if step is None:
                    break
                await websocket.send_json(
                    {
                        "type": "visit_node",
                        "node_id": step["node_id"],
                        "concept": step["concept"],
                        "hop": step["hop"],
                        "via_relation": step["via_relation"],
                    }
                )

            result = await task

            traversal = result["traversal"]
            await websocket.send_json(
                {
                    "type": "traversal_complete",
                    "nodes_visited": len(traversal),
                    "hops_used": max((step["hop"] for step in traversal), default=0),
                }
            )

            if result["no_match"]:
                await websocket.send_json({"type": "no_match", "message": result["answer"]})
            else:
                await websocket.send_json({"type": "answer", "text": result["answer"]})
        except Exception as exc:
            await websocket.send_json({"type": "error", "message": str(exc)})
