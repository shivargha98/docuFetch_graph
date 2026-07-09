/**
 * Left-side folder-ingestion dock, replacing the folder panel column: a
 * fixed top-left glass bar showing the active folder at a glance (basename +
 * FolderSourceBadge mode chip + live FolderStatusLine), which expands into
 * an overlay card holding the ingest controls — FolderDropZone (drop or pick
 * a local folder -> useFolderUpload), a "Browse server folders…" button
 * opening FolderBrowserModal (Select -> useFolderSwitch's submit), and a
 * shared inline error region for whichever flow last failed. Starts
 * collapsed (including on app start); auto-collapses when a flow succeeds
 * (ingestion kicked off — progress reads from the bar's status + the graph's
 * generating overlay). A failed flow keeps the card open so its error stays
 * visible; an in-flight upload keeps it open so the drop zone's "Uploading…"
 * copy stays visible.
 *
 * Owns `useIngestionStatus` (status polling), `useFolderSwitch`, and
 * `useFolderUpload` at this component's top level — the dock is mounted
 * once, unconditionally, by the app shell; the card body is CSS-hidden when
 * collapsed, never unmounted (ChatDock pattern), so polling and in-flight
 * uploads are unaffected by collapse.
 *
 * Source mode ("linked" vs "uploaded") is local state, defaulting to
 * "linked" once the prefill exists, and switched only when a flow succeeds:
 * folderPath changes only on success, so a pending-mode ref armed before
 * each submit/upload is committed by the folderPath-change effect below —
 * plus the direct same-path success commit in handleUpload (re-drop of the
 * currently-active folder succeeds WITHOUT a folderPath change).
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { FolderBrowserModal } from "./FolderBrowserModal";
import { FolderDropZone } from "./FolderDropZone";
import { FolderSourceBadge } from "./FolderSourceBadge";
import { FolderStatusLine } from "./FolderStatusLine";
import { useFolderSwitch } from "../../hooks/useFolderSwitch";
import { useFolderUpload } from "../../hooks/useFolderUpload";
import { useIngestionStatus } from "../../hooks/useIngestionStatus";
import { useIngestionState } from "../../state/providers";
import type { UploadEntry } from "../../lib/folderUpload";

/** How the active folder got here: a linked server path or an uploaded copy. */
type SourceMode = "linked" | "uploaded";

/** Returns the last path segment of a folder path (handles / and \ separators). */
function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** Renders the folder dock: persistent top-left bar + collapsible ingest card. */
export function FolderDock() {
  const { error: switchError, submitting, submit } = useFolderSwitch();
  const { uploading, error: uploadError, uploadEntries } = useFolderUpload();
  useIngestionStatus();
  const { state } = useIngestionState();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SourceMode | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  // Shared inline error region for both flows. Dock-owned (rather than
  // `switchError ?? uploadError`) because each hook clears only its own error
  // on its own success: the region shows whichever flow errored most
  // recently, and a success in EITHER flow clears it.
  const [flowError, setFlowError] = useState<string | null>(null);
  // Armed with the initiating flow's mode right before submit/upload;
  // committed only when that flow succeeds.
  const pendingModeRef = useRef<SourceMode | null>(null);
  const previousFolderPathRef = useRef<string | null>(state.folderPath);

  // folderPath changes only on a successful prefill/submit/upload, so a
  // change means a flow succeeded: commit the armed mode, clear the shared
  // error region, and collapse the dock (success = ingestion kicked off).
  useEffect(() => {
    if (state.folderPath !== previousFolderPathRef.current) {
      previousFolderPathRef.current = state.folderPath;
      setFlowError(null);
      setOpen(false);
      if (pendingModeRef.current !== null) {
        setMode(pendingModeRef.current);
        pendingModeRef.current = null;
      }
    }
  }, [state.folderPath]);

  // Mirror each flow's latest failure into the shared region as it happens.
  useEffect(() => {
    if (switchError !== null) setFlowError(switchError);
  }, [switchError]);
  useEffect(() => {
    if (uploadError !== null) setFlowError(uploadError);
  }, [uploadError]);

  // Default to "linked" once the prefill exists (the prefill is the backend's
  // watched server-side folder), until a flow explicitly sets the mode.
  const resolvedMode: SourceMode | null = mode ?? (state.folderPath !== null ? "linked" : null);
  // Only one flow may be in flight at a time: both entry points gate on this.
  const busy = submitting || uploading;

  /**
   * Uploads a collected folder from the drop zone, arming the "uploaded"
   * mode. On success, commits the mode/collapse/error-clear directly rather
   * than relying only on the folderPath-change effect: re-dropping the
   * currently-active folder (re-drop to refresh) succeeds WITHOUT a
   * folderPath change, and must still read as a success.
   */
  async function handleUpload(folderName: string, entries: UploadEntry[]) {
    pendingModeRef.current = "uploaded";
    const succeeded = await uploadEntries(folderName, entries);
    if (succeeded) {
      pendingModeRef.current = null;
      setMode("uploaded");
      setFlowError(null);
      setOpen(false);
    }
  }

  /** Submits a browsed server path, closes the modal, and arms the "linked" mode. */
  function handleBrowseSelect(path: string) {
    setBrowseOpen(false);
    pendingModeRef.current = "linked";
    void submit(path);
  }

  return (
    <div
      data-testid="folder-dock"
      className="glass-panel fixed left-4 top-4 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl shadow-glow-soft"
    >
      <button
        type="button"
        data-testid="folder-dock-toggle"
        aria-expanded={open}
        aria-label={open ? "Collapse folder panel" : "Expand folder panel"}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:text-ion",
          open && "border-b border-glass-border"
        )}
      >
        <span aria-hidden="true" className="font-mono text-xs text-ion">
          {open ? "▾" : "▸"}
        </span>
        {state.folderPath !== null ? (
          <>
            <span
              data-testid="active-folder-name"
              title={state.folderPath}
              className="min-w-0 truncate font-mono text-sm text-text-primary"
            >
              {basename(state.folderPath)}
            </span>
            {resolvedMode !== null && <FolderSourceBadge mode={resolvedMode} />}
            <span className="ml-auto shrink-0">
              <FolderStatusLine status={state.status} />
            </span>
          </>
        ) : (
          <span className="font-mono text-sm text-text-secondary">No folder — choose one</span>
        )}
      </button>
      <div
        data-testid="folder-dock-body"
        className={cn("flex-col gap-3 p-4", open ? "flex" : "hidden")}
      >
        <FolderDropZone onUpload={handleUpload} uploading={uploading} disabled={busy} />
        <button
          type="button"
          onClick={() => setBrowseOpen(true)}
          disabled={busy}
          className="self-start rounded-sm border border-glass-border px-2 py-1 font-mono text-[11px] text-text-secondary transition-colors hover:border-ion hover:text-ion disabled:opacity-50"
        >
          Browse server folders…
        </button>
        {flowError && (
          <p role="alert" data-testid="folder-flow-error" className="font-mono text-xs text-red-400">
            {flowError}
          </p>
        )}
      </div>
      <FolderBrowserModal
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onSelect={handleBrowseSelect}
      />
    </div>
  );
}
