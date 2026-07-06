/**
 * Handles submitting a chat question over the active `/ws/chat` WebSocket
 * connection (via `useWebSocket`) and wiring the resulting stream of events
 * into the chat slice of global state: the user's question and the eventual
 * answer/no_match message go into the transcript, and `visit_node` /
 * `traversal_complete` events drive the live per-query traversal trace. Only
 * one query may be in flight at a time.
 */
import { useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { useChatState } from "../state/providers";
import { useIngestionState } from "../state/providers";
import type { ChatMessage, ConnectionStatus, TraceStep } from "../state/types";

/** Shape of an incoming `/ws/chat` server frame, discriminated by `type`. */
interface VisitNodeFrame {
  type: "visit_node";
  node_id: string;
  concept: string;
  hop: number;
  via_relation: string | null;
}
interface TraversalCompleteFrame {
  type: "traversal_complete";
  nodes_visited: number;
  hops_used: number;
}
interface AnswerFrame {
  type: "answer";
  text: string;
}
interface NoMatchFrame {
  type: "no_match";
  message: string;
}
interface ErrorFrame {
  type: "error";
  message: string;
}
type ServerFrame = VisitNodeFrame | TraversalCompleteFrame | AnswerFrame | NoMatchFrame | ErrorFrame;

/** Public API returned by `useChatSession` for the chat panel to render against. */
export interface UseChatSessionResult {
  /** The full message transcript, in submission order. */
  messages: ChatMessage[];
  /** Submits a question; a no-op if empty or a query is already in flight. */
  submit: (text: string) => void;
  /** True from submission until an answer/no_match/error arrives for it. */
  queryInProgress: boolean;
  /** The live `/ws/chat` connection status, for rendering a status indicator. */
  connectionStatus: ConnectionStatus;
}

/**
 * Wires up the chat query submission flow: sends `{ query }` over the active
 * socket, appends the question to the transcript, and dispatches trace/answer
 * events as they stream back in. Intended to be called once, high enough in
 * the component tree that it keeps running even while the visible chat UI is
 * collapsed (state lives in Context, so events must keep flowing).
 */
export function useChatSession(): UseChatSessionResult {
  const { state: chatState, dispatch: chatDispatch } = useChatState();
  const { state: ingestionState } = useIngestionState();
  const { send, setOnMessage } = useWebSocket();

  const activeQueryIdRef = useRef<string | null>(chatState.activeQueryId ?? null);
  activeQueryIdRef.current = chatState.activeQueryId ?? null;

  useEffect(() => {
    setOnMessage((data: unknown) => {
      const frame = data as ServerFrame;
      const queryId = activeQueryIdRef.current;

      switch (frame.type) {
        case "visit_node": {
          if (!queryId) return;
          const step: TraceStep = {
            nodeId: frame.node_id,
            concept: frame.concept,
            hop: frame.hop,
            viaRelation: frame.via_relation,
          };
          chatDispatch({ type: "TRACE_STEP", queryId, step });
          return;
        }
        case "traversal_complete": {
          if (!queryId) return;
          chatDispatch({ type: "TRACE_COMPLETE", queryId });
          return;
        }
        case "answer": {
          chatDispatch({
            type: "ADD_MESSAGE",
            message: { kind: "answer", id: crypto.randomUUID(), text: frame.text },
          });
          chatDispatch({ type: "QUERY_END" });
          return;
        }
        case "no_match": {
          chatDispatch({
            type: "ADD_MESSAGE",
            message: { kind: "no_match", id: crypto.randomUUID(), message: frame.message },
          });
          chatDispatch({ type: "QUERY_END" });
          return;
        }
        case "error": {
          // Socket stays open per the backend contract; just release the
          // in-flight lock so the user can submit their next question.
          chatDispatch({ type: "QUERY_END" });
          return;
        }
        default:
          return;
      }
    });

    return () => setOnMessage(null);
  }, [setOnMessage, chatDispatch]);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (activeQueryIdRef.current) return;

      const queryId = crypto.randomUUID();
      chatDispatch({ type: "ADD_MESSAGE", message: { kind: "user", id: queryId, text: trimmed } });
      chatDispatch({ type: "QUERY_START", queryId });
      send({ query: trimmed });
    },
    [chatDispatch, send]
  );

  return {
    messages: chatState.messages,
    submit,
    queryInProgress: Boolean(chatState.activeQueryId),
    connectionStatus: ingestionState.connectionStatus,
  };
}
