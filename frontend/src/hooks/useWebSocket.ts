/**
 * Manages the WebSocket connection lifecycle for the docuFetch Graph chat
 * traversal stream (`ws://<host>/ws/chat`, dev-proxied): connecting once a
 * folder is configured, reflecting connect/disconnect/error outcomes into
 * the ingestion slice's `connectionStatus`, and automatically reconnecting
 * after an unexpected close with an exponential backoff. One socket serves
 * many sequential chat queries -- this hook never reconnects per query, only
 * on an actual dropped connection.
 */
import { useCallback, useEffect, useRef } from "react";
import { useIngestionState } from "../state/providers";

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;

/** Controls returned by `useWebSocket` for driving a single chat socket connection. */
export interface UseWebSocketResult {
  /** Sends a JSON-serializable payload over the active connection; a no-op if not currently open. */
  send: (data: unknown) => void;
  /** Registers the handler invoked with each parsed JSON message received over the socket (pass null to clear it). */
  setOnMessage: (handler: ((data: unknown) => void) | null) => void;
}

/**
 * Opens (and keeps open) a WebSocket connection to `/ws/chat` once a folder
 * is configured in ingestion state (`folderPath` non-null), dispatching
 * `CONNECTION_STATUS` updates as the connection attempts, connects, errors,
 * or unexpectedly closes. An unexpected close schedules a reconnect attempt
 * after an exponential backoff (starting at 1s, capped at 10s).
 */
export function useWebSocket(): UseWebSocketResult {
  const { state: ingestionState, dispatch } = useIngestionState();
  const folderPath = ingestionState.folderPath;

  const socketRef = useRef<WebSocket | null>(null);
  const isOpenRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const onMessageRef = useRef<((data: unknown) => void) | null>(null);
  const cleanedUpRef = useRef(false);

  const setOnMessage = useCallback((handler: ((data: unknown) => void) | null) => {
    onMessageRef.current = handler;
  }, []);

  useEffect(() => {
    if (!folderPath) return;
    cleanedUpRef.current = false;

    function connect() {
      dispatch({ type: "CONNECTION_STATUS", status: "connecting" });
      const socket = new WebSocket(`ws://${window.location.host}/ws/chat`);
      socketRef.current = socket;

      socket.onopen = () => {
        isOpenRef.current = true;
        attemptRef.current = 0;
        dispatch({ type: "CONNECTION_STATUS", status: "connected" });
      };

      socket.onmessage = (event: MessageEvent) => {
        if (!onMessageRef.current) return;
        try {
          onMessageRef.current(JSON.parse(event.data as string));
        } catch {
          // Malformed frame -- ignore, socket stays open per the backend contract.
        }
      };

      socket.onerror = () => {
        isOpenRef.current = false;
        dispatch({ type: "CONNECTION_STATUS", status: "error" });
      };

      socket.onclose = () => {
        isOpenRef.current = false;
        if (cleanedUpRef.current) return;
        dispatch({ type: "CONNECTION_STATUS", status: "disconnected" });
        const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** attemptRef.current, MAX_BACKOFF_MS);
        attemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cleanedUpRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [folderPath, dispatch]);

  const send = useCallback((data: unknown) => {
    if (socketRef.current && isOpenRef.current) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, setOnMessage };
}
