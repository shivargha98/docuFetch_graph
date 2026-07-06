"""
API/contract tests for the WebSocket traversal-step streaming endpoint: live,
discrete traversal events during a chat query, followed by a completion event
and the final answer event.

Full WS message schema finalized in docs/backend/backend_context.md decision
#5: `visit_node` (one per traversal step), `traversal_complete` (once, after
all steps), `answer`/`no_match` (exactly one, after traversal_complete), and
`error` (at any point on failure, connection stays open for the next query).

Each test monkeypatches `backend.query_service.seed_from_query` (the name as
bound inside `query_service`'s own module namespace via its `from ... import
seed_from_query` statement) directly to a fixed seed list, instead of
exercising a real Chroma instance - see the worker report for why this
target was used instead of `backend.retrieval.seed.seed_from_query` (patching
the latter has no effect on `query_service`'s already-bound name).
"""
import backend.config as config
from backend.graph_store.store import GraphStore

WS_CHAT_ENDPOINT = "/ws/chat"


def _persist_sample_graph_and_seed(tmp_path, monkeypatch, sample_graph, seed_node_id="concept_machine_learning"):
    """
    Persist `sample_graph` at a temp path and monkeypatch config.GRAPH_STORE_PATH
    / config.CHROMA_DB_PATH to point at it, plus monkeypatch
    backend.query_service.seed_from_query to return a single fixed seed
    (`seed_node_id`), so the WS route's answer_query call runs against a real,
    known graph without needing a real Chroma instance or network calls.
    """
    graph_path = tmp_path / "graph_store.json"
    monkeypatch.setattr(config, "GRAPH_STORE_PATH", str(graph_path))
    monkeypatch.setattr(config, "CHROMA_DB_PATH", str(tmp_path / "chroma_ws_test"))
    GraphStore(graph=sample_graph).persist(graph_path)

    monkeypatch.setattr(
        "backend.query_service.seed_from_query",
        lambda query, vector_store, top_k=5: [{"node_id": seed_node_id, "score": 0.0}],
    )


def test_traversal_produces_one_streamed_event_per_visited_node(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client, tmp_path, monkeypatch
):
    """
    Given a WebSocket connection and a query that triggers a multi-hop
    traversal,
    when the query is submitted over the WS connection,
    one discrete event should be received per visited node/edge, not a single
    batched dump at the end.

    Source: Feature: Traversal-Step Streaming — criterion 1; Issue 14 — criterion 1
    """
    _persist_sample_graph_and_seed(tmp_path, monkeypatch, sample_graph)
    mock_traversal_llm.set_response({"next_node_id": "concept_artificial_intelligence", "relation": "part_of"})

    with ws_test_client.websocket_connect(WS_CHAT_ENDPOINT) as ws:
        ws.send_json({"query": "What is Machine Learning?"})

        visit_events = []
        event = ws.receive_json()
        while event["type"] == "visit_node":
            visit_events.append(event)
            event = ws.receive_json()

        assert event["type"] == "traversal_complete"
        assert len(visit_events) == 2
        assert [e["node_id"] for e in visit_events] == [
            "concept_machine_learning",
            "concept_artificial_intelligence",
        ]


def test_each_streamed_step_event_includes_concept_and_hop_number(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client, tmp_path, monkeypatch
):
    """
    Given a streamed traversal-step event,
    when the event payload is inspected,
    the event should include at minimum the concept visited and its hop
    number.

    Source: Feature: Traversal-Step Streaming — criterion 2; Issue 14 — criterion 2
    """
    _persist_sample_graph_and_seed(tmp_path, monkeypatch, sample_graph)
    mock_traversal_llm.set_response({"next_node_id": "concept_artificial_intelligence", "relation": "part_of"})

    with ws_test_client.websocket_connect(WS_CHAT_ENDPOINT) as ws:
        ws.send_json({"query": "What is Machine Learning?"})

        first_event = ws.receive_json()
        assert first_event["type"] == "visit_node"
        assert first_event["concept"] == "Machine Learning"
        assert first_event["hop"] == 0

        second_event = ws.receive_json()
        assert second_event["type"] == "visit_node"
        assert second_event["concept"] == "Artificial Intelligence"
        assert second_event["hop"] == 1
        assert second_event["via_relation"] == "part_of"


def test_distinct_completion_event_signals_traversal_end(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client, tmp_path, monkeypatch
):
    """
    Given a completed traversal streamed over WS,
    when all step events have been received,
    a completion event distinct from the visit-node events should be received.

    Source: Feature: Traversal-Step Streaming — criterion 3; Issue 14 — criterion 3
    """
    _persist_sample_graph_and_seed(tmp_path, monkeypatch, sample_graph)
    mock_traversal_llm.set_response({"next_node_id": "concept_artificial_intelligence", "relation": "part_of"})

    with ws_test_client.websocket_connect(WS_CHAT_ENDPOINT) as ws:
        ws.send_json({"query": "What is Machine Learning?"})

        event = ws.receive_json()
        while event["type"] == "visit_node":
            event = ws.receive_json()

        assert event["type"] == "traversal_complete"
        assert event["nodes_visited"] == 2
        assert event["hops_used"] == 1


def test_final_answer_arrives_as_own_event_after_completion(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client, tmp_path, monkeypatch
):
    """
    Given a completed traversal and generated answer, streamed over WS,
    when the full event sequence is inspected,
    the final answer (or not-found message) should be delivered as its own
    event, strictly after the completion event, not interleaved among
    visit-node events.

    Source: Feature: Traversal-Step Streaming — criterion 4; Issue 14 — criterion 4
    """
    _persist_sample_graph_and_seed(tmp_path, monkeypatch, sample_graph)
    mock_traversal_llm.set_response({"next_node_id": "concept_artificial_intelligence", "relation": "part_of"})
    mock_haiku_client.set_response("Line one.\nLine two.\nLine three.\nLine four.")

    with ws_test_client.websocket_connect(WS_CHAT_ENDPOINT) as ws:
        ws.send_json({"query": "What is Machine Learning?"})

        events = [ws.receive_json() for _ in range(4)]

        types = [e["type"] for e in events]
        assert types == ["visit_node", "visit_node", "traversal_complete", "answer"]
        assert events[-1]["text"] == "Line one.\nLine two.\nLine three.\nLine four."


def test_full_ws_message_schema_matches_finalized_contract(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client, tmp_path, monkeypatch
):
    """
    Given a finalized full WS event-type schema,
    when a chat query (including an error/interrupt scenario) is streamed,
    every event type in the schema should be exercised and validated.

    Schema finalized in backend_context.md decision #5:
    `visit_node` / `traversal_complete` / `answer` (or `no_match`) / `error`.
    Exercises the `answer` path first (traversal completes normally), then
    reconfigures the mocked traversal-reasoning LLM to raise mid-traversal on
    the same open connection to exercise the `error` path, proving one bad
    query doesn't close the socket.

    Source: Issue 14 — caveat (open question: full WS message schema)
    """
    _persist_sample_graph_and_seed(tmp_path, monkeypatch, sample_graph)
    mock_traversal_llm.set_response({"next_node_id": "concept_artificial_intelligence", "relation": "part_of"})
    mock_haiku_client.set_response("Line one.\nLine two.\nLine three.\nLine four.")

    with ws_test_client.websocket_connect(WS_CHAT_ENDPOINT) as ws:
        ws.send_json({"query": "What is Machine Learning?"})

        events = [ws.receive_json() for _ in range(4)]
        types = [e["type"] for e in events]
        assert types == ["visit_node", "visit_node", "traversal_complete", "answer"]
        assert events[0]["node_id"] == "concept_machine_learning"
        assert events[0]["via_relation"] is None
        assert events[2]["nodes_visited"] == 2
        assert events[3]["text"]

        mock_traversal_llm.set_side_effect(RuntimeError("boom"))
        ws.send_json({"query": "Trigger an error"})

        error_events = []
        event = ws.receive_json()
        while event["type"] != "error":
            error_events.append(event)
            event = ws.receive_json()

        assert event["type"] == "error"
        assert event["message"] == "boom"
