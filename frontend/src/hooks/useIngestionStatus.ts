/**
 * Polls GET /api/graph on an interval to derive a best-effort ingestion
 * status (watching/extracting/idle) for the currently configured folder,
 * since the shipped backend has no ingestion-event push channel (see
 * docs/frontend/frontend_context.md decision D3: no ingestion WS channel,
 * no /ingest/status endpoint). Starts polling once a folder path is set in
 * ingestion state, and stops/restarts polling whenever the folder changes.
 * Source: Feature: Live Ingestion Status Display (docs/frontend/features.md), Issue 5.
 */
import { useEffect } from "react";
import { useIngestionState } from "../state/providers";

/** Poll interval for GET /api/graph, within the brief's suggested 2-3s range. */
const POLL_INTERVAL_MS = 2500;

/**
 * Starts (and restarts on folder change) a poll loop against GET /api/graph,
 * diffing the returned node-id set between successive polls to derive an
 * ingestion status:
 * - The very first poll for a folder establishes the node-count baseline and
 *   reports "watching" (nothing observed yet to call activity).
 * - A poll whose node count grew since the previous poll reports
 *   "extracting" (something was ingested since we last looked).
 * - A poll with no growth reports "idle" once growth has been observed at
 *   least once before (settled after activity), or "watching" otherwise
 *   (still waiting, nothing has happened yet).
 *
 * `/api/graph` exposes no per-file extraction event or queue-depth number,
 * so the derived status never sets `file`/`queued` -- see the worker report
 * for why attributing a newly-seen node's `source_files` entry to "currently
 * extracting" was rejected as misleading rather than a real value.
 */
export function useIngestionStatus(): void {
  const { state, dispatch } = useIngestionState();
  const folderPath = state.folderPath;

  useEffect(() => {
    if (!folderPath) return;

    let cancelled = false;
    let previousNodeIds: Set<string> | null = null;
    let everGrew = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/graph");
        if (cancelled || !res.ok) return;
        const body = await res.json();
        const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
        const currentNodeIds = new Set<string>(nodes.map((node: { id: string }) => node.id));

        if (previousNodeIds === null) {
          dispatch({ type: "STATUS_UPDATE", status: { state: "watching" } });
        } else if (currentNodeIds.size > previousNodeIds.size) {
          everGrew = true;
          dispatch({ type: "STATUS_UPDATE", status: { state: "extracting" } });
        } else if (everGrew) {
          dispatch({ type: "STATUS_UPDATE", status: { state: "idle" } });
        } else {
          dispatch({ type: "STATUS_UPDATE", status: { state: "watching" } });
        }
        previousNodeIds = currentNodeIds;
      } catch {
        // No acceptance criterion covers a failed poll; skip this cycle and
        // try again on the next tick rather than surfacing an error state.
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [folderPath, dispatch]);
}
