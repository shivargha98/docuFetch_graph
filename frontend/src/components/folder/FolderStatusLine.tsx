/**
 * Presentational status readout for the folder panel: renders the current
 * ingestion status (idle / watching / extracting) as a small monospace line,
 * driven entirely by the `status` prop -- no data fetching of its own.
 * Source: Feature: Live Ingestion Status Display (docs/frontend/features.md), Issue 5.
 */
import type { IngestionStatus } from "../../state/types";

interface FolderStatusLineProps {
  /** The current ingestion status to render (idle / watching / extracting). */
  status: IngestionStatus;
}

/** Renders a one-line, monospaced status readout describing the ingestion state. */
export function FolderStatusLine({ status }: FolderStatusLineProps) {
  const text = (() => {
    switch (status.state) {
      case "watching":
        return status.queued !== undefined ? `Watching · ${status.queued} queued` : "Watching";
      case "extracting":
        return status.file ? `Extracting · ${status.file}` : "Extracting";
      case "idle":
      default:
        return "Idle · up to date";
    }
  })();

  return (
    <p className="mt-2 font-mono text-xs text-muted" data-testid="folder-status-line">
      {text}
    </p>
  );
}
