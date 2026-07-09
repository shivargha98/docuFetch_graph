/**
 * Mode badge for the folder panel's active-source line: tells the user
 * whether the graph is fed by a live server-side folder ("Linked folder") or
 * by a one-shot copy uploaded from their machine ("Uploaded copy · re-drop to
 * refresh"). Purely presentational — the mode is decided by FolderPanel.
 *
 * Design (frontend-design skill): reuses the notched synapse-chip vocabulary
 * established by NodeDetailOverlay / FolderBrowserModal's drive chips, with
 * the app's duotone carrying the meaning — ion (cyan) for a live link into
 * the filesystem, synapse (violet) for a copy held inside the system.
 * Source: Task 8 brief (.superpowers/sdd/task-8-brief.md).
 */
import { cn } from "../../lib/utils";

interface FolderSourceBadgeProps {
  /** How the active folder got here: a linked server path or an uploaded copy. */
  mode: "linked" | "uploaded";
}

/** Renders the notched mono chip describing the active folder's source mode. */
export function FolderSourceBadge({ mode }: FolderSourceBadgeProps) {
  const linked = mode === "linked";
  return (
    <span
      data-testid="folder-source-badge"
      data-mode={mode}
      className={cn(
        "shrink-0 border px-2 py-0.5 font-mono text-[10px] [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%)]",
        linked ? "border-ion/60 text-ion" : "border-synapse/60 text-synapse"
      )}
    >
      {linked ? "Linked folder" : "Uploaded copy · re-drop to refresh"}
    </span>
  );
}
