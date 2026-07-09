/**
 * Folder-source panel, reworked around drag-and-drop upload and server-side
 * browsing (the free-text path input is gone): renders an active-source line
 * (folder basename + FolderSourceBadge mode chip), the FolderDropZone (drop or
 * pick a local folder -> useFolderUpload), a "Browse server folders…" button
 * opening FolderBrowserModal (Select -> useFolderSwitch's submit, which also
 * tears down graph/chat on a genuine switch), a shared inline error region for
 * whichever flow last failed, and FolderStatusLine. `useIngestionStatus`
 * (Round 3, Issue 5's polling loop) is still called here at the FolderPanel
 * level -- not inside the panel's collapsible content -- so its polling
 * interval survives the content unmounting on collapse (CollapsiblePanel's
 * default, non-forceMount behavior).
 *
 * Source mode ("linked" vs "uploaded") is local state, defaulting to "linked"
 * once the prefill exists, and switched only when a flow *succeeds*: both
 * flows change ingestion state's folderPath exclusively on success, so a
 * pending-mode ref armed before each submit/upload is committed by the
 * folderPath-change effect below.
 */
import { useEffect, useRef, useState } from "react";
import { CollapsiblePanel } from "../ui/CollapsiblePanel";
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

interface FolderPanelProps {
  /** Optional extra classes for panel sizing within the app shell. */
  className?: string;
}

/** Returns the last path segment of a folder path (handles / and \ separators). */
function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** Renders the folder panel with a stable `folder-panel` test id. */
export function FolderPanel({ className }: FolderPanelProps) {
  const { error: switchError, submitting, submit } = useFolderSwitch();
  const { uploading, error: uploadError, uploadEntries } = useFolderUpload();
  useIngestionStatus();
  const { state } = useIngestionState();

  const [mode, setMode] = useState<SourceMode | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  // Shared inline error region for both flows. Panel-owned (rather than
  // `switchError ?? uploadError`) because each hook clears only its own error
  // on its own success: the region shows whichever flow errored most
  // recently, and a success in EITHER flow clears it (see the folderPath
  // effect below).
  const [flowError, setFlowError] = useState<string | null>(null);
  // Armed with the initiating flow's mode right before submit/upload;
  // committed only when that flow succeeds (see the effect below).
  const pendingModeRef = useRef<SourceMode | null>(null);
  const previousFolderPathRef = useRef<string | null>(state.folderPath);

  // folderPath changes only on a successful prefill/submit/upload, so a
  // change means a flow succeeded: commit the armed mode and clear the
  // shared error region regardless of which flow the stale error came from.
  useEffect(() => {
    if (state.folderPath !== previousFolderPathRef.current) {
      previousFolderPathRef.current = state.folderPath;
      setFlowError(null);
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

  /** Uploads a collected folder from the drop zone, arming the "uploaded" mode. */
  function handleUpload(folderName: string, entries: UploadEntry[]) {
    pendingModeRef.current = "uploaded";
    void uploadEntries(folderName, entries);
  }

  /** Submits a browsed server path, closes the modal, and arms the "linked" mode. */
  function handleBrowseSelect(path: string) {
    setBrowseOpen(false);
    pendingModeRef.current = "linked";
    void submit(path);
  }

  return (
    <CollapsiblePanel title="Folder" testId="folder-panel" className={className}>
      <div className="flex flex-col gap-3">
        {state.folderPath !== null && (
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="font-mono text-xs text-ion">
              ▸
            </span>
            <span
              data-testid="active-folder-name"
              title={state.folderPath}
              className="min-w-0 truncate font-mono text-sm text-text-primary"
            >
              {basename(state.folderPath)}
            </span>
            {resolvedMode !== null && <FolderSourceBadge mode={resolvedMode} />}
          </div>
        )}
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
        <FolderStatusLine status={state.status} />
      </div>
      <FolderBrowserModal
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onSelect={handleBrowseSelect}
      />
    </CollapsiblePanel>
  );
}
