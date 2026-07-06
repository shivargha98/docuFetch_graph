"""
API/contract tests for the WebSocket traversal-step streaming endpoint: live,
discrete traversal events during a chat query, followed by a completion event
and the final answer event.

OPEN QUESTION (Issue 14): the full WS message schema (all event types,
including error/interrupt events) is not yet decided beyond the illustrative
sketch `{type: "visit_node", concept: "X", hop: 2}`. The schema-completeness
test below is skipped until the full contract is finalized.
"""
import pytest


def test_traversal_produces_one_streamed_event_per_visited_node(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client
):
    """
    Given a WebSocket connection and a query that triggers a multi-hop
    traversal,
    when the query is submitted over the WS connection,
    one discrete event should be received per visited node/edge, not a single
    batched dump at the end.

    Source: Feature: Traversal-Step Streaming — criterion 1; Issue 14 — criterion 1
    """
    raise NotImplementedError


def test_each_streamed_step_event_includes_concept_and_hop_number(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client
):
    """
    Given a streamed traversal-step event,
    when the event payload is inspected,
    the event should include at minimum the concept visited and its hop
    number.

    Source: Feature: Traversal-Step Streaming — criterion 2; Issue 14 — criterion 2
    """
    raise NotImplementedError


def test_distinct_completion_event_signals_traversal_end(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client
):
    """
    Given a completed traversal streamed over WS,
    when all step events have been received,
    a completion event distinct from the visit-node events should be received.

    Source: Feature: Traversal-Step Streaming — criterion 3; Issue 14 — criterion 3
    """
    raise NotImplementedError


def test_final_answer_arrives_as_own_event_after_completion(
    ws_test_client, sample_graph, mock_traversal_llm, mock_haiku_client
):
    """
    Given a completed traversal and generated answer, streamed over WS,
    when the full event sequence is inspected,
    the final answer (or not-found message) should be delivered as its own
    event, strictly after the completion event, not interleaved among
    visit-node events.

    Source: Feature: Traversal-Step Streaming — criterion 4; Issue 14 — criterion 4
    """
    raise NotImplementedError


@pytest.mark.skip(
    reason="OPEN QUESTION (Issue 14): full WS message schema (all event "
    "types, including error/interrupt events) undecided beyond the "
    "illustrative sketch. Fill in once settled, then unskip."
)
def test_full_ws_message_schema_matches_finalized_contract(ws_test_client):
    """
    Given a finalized full WS event-type schema,
    when a chat query (including an error/interrupt scenario) is streamed,
    every event type in the schema should be exercised and validated.

    OPEN QUESTION (Issue 14): placeholder only until the full schema is
    decided.

    Source: Issue 14 — caveat (open question: full WS message schema)
    """
    raise NotImplementedError
