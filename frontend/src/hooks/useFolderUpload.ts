/**
 * Hook that uploads a collected set of folder-relative files to the backend's
 * folder-upload endpoint. Mirrors useFolderConfig.submit's fetch/error/dispatch
 * structure: on success, mirrors the returned path into the global ingestion
 * state (RESET_FOLDER + STATUS_UPDATE watching), which drives the same
 * genuine-folder-switch wiring (useFolderSwitch's RESET_GRAPH/RESET_SESSION/
 * GENERATING_START) as a browse-path submit does.
 * Source: Task 6 brief (frontend folder upload plumbing).
 */
import { useCallback, useState } from "react";
import { useIngestionState } from "../state/providers";
import { extractErrorMessage } from "./useFolderConfig";
import type { UploadEntry } from "../lib/folderUpload";

/** Result returned by useFolderUpload: in-flight/error state and the upload function. */
export interface UseFolderUploadResult {
  /** True while an upload POST is in flight. */
  uploading: boolean;
  /** A readable message describing the last failed upload, or null if there is none. */
  error: string | null;
  /** Uploads the given folder name and collected entries to the backend. */
  uploadEntries: (folderName: string, entries: UploadEntry[]) => Promise<void>;
}

/**
 * Builds a multipart FormData (a `folder_name` field plus each entry appended
 * under `files` with its relativePath as the filename) and POSTs it to
 * `/api/ingest/upload`, tracking in-flight/error state. On success, dispatches
 * RESET_FOLDER and STATUS_UPDATE (watching) to the shared ingestion state,
 * same as useFolderConfig.submit.
 */
export function useFolderUpload(): UseFolderUploadResult {
  const { dispatch } = useIngestionState();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadEntries = useCallback(
    async (folderName: string, entries: UploadEntry[]) => {
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
          dispatch({ type: "RESET_FOLDER", folderPath: body.path });
          dispatch({ type: "STATUS_UPDATE", status: { state: "watching" } });
        } else {
          setError(extractErrorMessage(body));
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        setUploading(false);
      }
    },
    [dispatch]
  );

  return { uploading, error, uploadEntries };
}
