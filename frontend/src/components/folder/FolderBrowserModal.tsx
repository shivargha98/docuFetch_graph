/**
 * Folder-browser modal: a dialog over a dimmed backdrop that lists server-side
 * directories via useBrowse and lets the user walk into subdirectories, jump
 * up/home, hop between drives (Windows), and confirm the current directory
 * with Select. Fetches the home listing each time it opens. Purely
 * presentational over the useBrowse hook — all fetch/error logic lives there.
 *
 * Design (frontend-design skill, invoked before writing this file): the modal
 * reads as a filesystem-traversal instrument in the app's synaptic HUD world,
 * a sibling of NodeDetailOverlay rather than a generic dialog. Signature: the
 * current-path readout is a mono "address rail" led by an ion prompt glyph,
 * capped by the same ion-to-synapse gradient hairline as the overlay's energy
 * bar. Drive chips reuse the overlay's notched synapse chip vocabulary
 * (drives are navigation chips, like linked concepts); directory rows are
 * quiet mono rows whose leading "/" glyph tints ion on hover; section labels
 * are the established ":: uppercase tracked mono" telemetry style. Strictly
 * the existing ion/synapse/muted duotone — no new colors or faces.
 * Source: Task 7 brief (.superpowers/sdd/task-7-brief.md).
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUp, House } from "lucide-react";
import { useBrowse } from "../../hooks/useBrowse";

interface FolderBrowserModalProps {
  /** Whether the modal is shown. On the transition to open, the home listing is fetched. */
  open: boolean;
  /** Called when the modal should close: backdrop click, Escape, or the close control. */
  onClose: () => void;
  /** Called with the currently listed directory's path when Select is clicked. */
  onSelect: (path: string) => void;
}

/**
 * Renders the folder-browser dialog when `open`, fetching the home directory
 * listing on open. Clicking a directory row navigates into it, Up goes to the
 * parent (disabled at a root), Home returns to the home directory, drive
 * chips (when present) jump to a drive root, and Select reports the current
 * path to the caller.
 */
export function FolderBrowserModal({ open, onClose, onSelect }: FolderBrowserModalProps) {
  const { currentPath, parent, drives, dirs, loading, error, navigate } = useBrowse();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) void navigate();
  }, [open, navigate]);

  // Move focus into the dialog on open so screen readers land in it and
  // Escape works immediately.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  /** Closes the dialog when Escape is pressed anywhere inside it. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div
        data-testid="folder-browser-backdrop"
        className="absolute inset-0 bg-void/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Browse folders"
        data-testid="folder-browser-modal"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="glass-panel relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-md shadow-glow-ion focus:outline-none"
      >
        {/* Signature: ion-to-synapse energy hairline capping the card, echoing NodeDetailOverlay. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-3 -top-px h-px bg-gradient-to-r from-ion via-synapse to-ion"
        />

        <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <h2 className="font-display text-sm uppercase tracking-wide text-text-primary">
            Browse folders
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-mono text-xs text-text-secondary transition-colors hover:text-ion"
          >
            [x]
          </button>
        </div>

        {/* Address rail: current path as a mono readout led by an ion prompt glyph. */}
        <div className="flex items-center gap-2 border-b border-glass-border bg-void/40 px-4 py-2">
          <span aria-hidden="true" className="font-mono text-xs text-ion">
            ▸
          </span>
          <span
            data-testid="browse-current-path"
            className="min-w-0 flex-1 truncate font-mono text-xs text-text-primary"
            title={currentPath}
          >
            {currentPath || "…"}
          </span>
          <button
            type="button"
            onClick={() => parent !== null && navigate(parent)}
            disabled={parent === null}
            className="flex items-center gap-1 rounded-sm border border-glass-border px-2 py-1 font-mono text-[11px] text-text-secondary transition-colors hover:border-ion hover:text-ion disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-glass-border disabled:hover:text-text-secondary"
          >
            <ArrowUp size={12} aria-hidden="true" />
            Up
          </button>
          <button
            type="button"
            onClick={() => navigate()}
            className="flex items-center gap-1 rounded-sm border border-glass-border px-2 py-1 font-mono text-[11px] text-text-secondary transition-colors hover:border-ion hover:text-ion"
          >
            <House size={12} aria-hidden="true" />
            Home
          </button>
        </div>

        {drives !== null && drives.length > 0 && (
          <div className="border-b border-glass-border px-4 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              :: Drives
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {drives.map((drive) => (
                <button
                  key={drive}
                  type="button"
                  onClick={() => navigate(drive)}
                  className="border border-synapse/60 px-2 py-0.5 font-mono text-xs text-synapse [clip-path:polygon(6px_0,100%_0,100%_100%,0_100%)] hover:shadow-glow-synapse"
                >
                  {drive}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-busy={loading}>
          <p className="px-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            :: Directories
          </p>
          {dirs.length === 0 && !loading ? (
            <p className="px-2 py-3 font-mono text-xs text-muted">No subfolders here.</p>
          ) : (
            <ul className="mt-1">
              {dirs.map((dir) => (
                <li key={dir.path}>
                  <button
                    type="button"
                    onClick={() => navigate(dir.path)}
                    className="group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-sm text-text-primary transition-colors hover:bg-ion/10"
                  >
                    <span aria-hidden="true" className="text-muted transition-colors group-hover:text-ion">
                      /
                    </span>
                    <span className="truncate">{dir.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-glass-border px-4 py-3">
          {error ? (
            <p role="alert" className="min-w-0 flex-1 truncate font-mono text-xs text-red-400">
              {error}
            </p>
          ) : (
            <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-secondary">
              {loading ? "scanning…" : "Pick a folder, then Select."}
            </p>
          )}
          <button
            type="button"
            onClick={() => onSelect(currentPath)}
            disabled={currentPath === ""}
            className="rounded-md border border-ion px-3 py-1.5 text-sm text-ion transition-colors hover:bg-ion/10 disabled:opacity-50"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
