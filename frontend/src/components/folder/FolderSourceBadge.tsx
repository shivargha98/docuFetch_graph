/**
 * Mode badge for the folder panel's active-source line: tells the user
 * whether the graph is fed by a live server-side folder ("Linked") or by a
 * one-shot copy uploaded from their machine ("Uploaded copy", with the
 * re-drop-to-refresh guidance in its tooltip — the long inline text crushed
 * the folder name in the ~340px panel; see
 * docs/superpowers/specs/2026-07-09-folder-panel-cleanup-design.md). Purely
 * presentational — the mode is decided by FolderDock.
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
      title={linked ? undefined : "Re-drop the folder to refresh its copy"}
      className={cn(
        "shrink-0 border px-2 py-0.5 font-mono text-[10px] [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%)]",
        linked ? "border-ion/60 text-ion" : "border-synapse/60 text-synapse"
      )}
    >
      {linked ? "Linked" : "Uploaded copy"}
    </span>
  );
}
