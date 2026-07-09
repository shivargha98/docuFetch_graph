/**
 * Hook that uploads a collected set of folder-relative files to the backend's
 * folder-upload endpoint. Mirrors useFolderConfig.submit's fetch/error/dispatch
 * structure: on success, mirrors the returned path into the global ingestion
 * state (RESET_FOLDER + STATUS_UPDATE watching), which drives the same
 * genuine-folder-switch wiring (useFolderSwitch's RESET_GRAPH/RESET_SESSION/
 * GENERATING_START) as a browse-path submit does.
 *
 * Same-path re-upload (the advertised "re-drop to refresh" flow): when the
 * returned path EQUALS the current folderPath, useFolderSwitch's change-based
 * wiring never fires even though the backend wiped, re-ingested, and reset
 * the chat session — so this hook dispatches RESET_GRAPH/GENERATING_START/
 * RESET_SESSION itself in that case. `uploadEntries` also resolves to a
 * success boolean so FolderDock can react (collapse the dock)
 * without inferring success from a folderPath change.
 * Source: Task 6 brief (frontend folder upload plumbing).
 */
import { useCallback, useState } from "react";
import { useChatState, useGraphState, useIngestionState } from "../state/providers";
import { extractErrorMessage } from "./useFolderConfig";
import type { UploadEntry } from "../lib/folderUpload";

/** Result returned by useFolderUpload: in-flight/error state and the upload function. */
export interface UseFolderUploadResult {
  /** True while an upload POST is in flight. */
  uploading: boolean;
  /** A readable message describing the last failed upload, or null if there is none. */
  error: string | null;
  /** Uploads the given folder name and collected entries to the backend. Resolves true on success. */
  uploadEntries: (folderName: string, entries: UploadEntry[]) => Promise<boolean>;
}

/**
 * Builds a multipart FormData (a `folder_name` field plus each entry appended
 * under `files` with its relativePath as the filename) and POSTs it to
 * `/api/ingest/upload`, tracking in-flight/error state. On success, dispatches
 * RESET_FOLDER and STATUS_UPDATE (watching) to the shared ingestion state,
 * same as useFolderConfig.submit — plus, when the path didn't change (re-drop
 * of the currently-active uploaded copy), the graph/chat reset trio that
 * useFolderSwitch would otherwise dispatch on the path change.
 */
export function useFolderUpload(): UseFolderUploadResult {
  const { state, dispatch } = useIngestionState();
  const { dispatch: dispatchGraph } = useGraphState();
  const { dispatch: dispatchChat } = useChatState();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentFolderPath = state.folderPath;

  const uploadEntries = useCallback(
    async (folderName: string, entries: UploadEntry[]): Promise<boolean> => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("folder_name", folderName);
        for (const entry of entries) {
          formData.append("files", entry.file, entry.relativePath);
        }
        const res = await fetch("/api/ingest/upload", {
          method: "POST",
          body: formData,
        });
        const body = await res.json();
        if (res.ok) {
          setError(null);
          if (body.path === currentFolderPath) {
            // Re-ingest of the already-active copy: the backend re-ingested
            // and reset the chat session, but folderPath won't change, so
            // useFolderSwitch's wiring stays silent — dispatch it here.
            dispatchGraph({ type: "RESET_GRAPH" });
            dispatchGraph({ type: "GENERATING_START" });
            dispatchChat({ type: "RESET_SESSION" });
          }
          dispatch({ type: "RESET_FOLDER", folderPath: body.path });
          dispatch({ type: "STATUS_UPDATE", status: { state: "watching" } });
          return true;
        }
        setError(extractErrorMessage(body));
        return false;
      } catch {
        setError("Could not reach the server.");
        return false;
      } finally {
        setUploading(false);
      }
    },
    [dispatch, dispatchGraph, dispatchChat, currentFolderPath]
  );

  return { uploading, error, uploadEntries };
}
