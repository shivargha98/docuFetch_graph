/**
 * While the graph slice's `generating` flag is set (a folder switch/upload
 * kicked off ingestion), polls GET /api/ingest-status and dispatches
 * GENERATING_END once the backend reports the ingestion/reconciliation
 * thread has finished. Real signal, not a node-count heuristic — pairs with
 * the graph viewport's generating overlay.
 */
import { useEffect } from "react";
import { useGraphState } from "../state/providers";

const POLL_INTERVAL_MS = 1500;

/** Polls /api/ingest-status while generating; clears the flag when the backend goes idle. */
export function useGeneratingStatus(): void {
  const { state, dispatch } = useGraphState();
  const generating = state.generating;

  useEffect(() => {
    if (!generating) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/ingest-status");
        if (cancelled || !res.ok) return;
        const body = await res.json();
        if (body.ingesting === false) dispatch({ type: "GENERATING_END" });
      } catch {
        // Transient poll failure: try again next tick.
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [generating, dispatch]);
}
