/**
 * Hook that loads the backend's currently-watched folder path on mount and
 * exposes a submit function for changing it. Mirrors the folder path into the
 * global ingestion state (RESET_FOLDER + STATUS_UPDATE) after both the initial
 * prefill and every successful submission, since the WebSocket layer and later
 * ingestion-status/folder-switch work key off `folderPath` being populated
 * this way.
 * Source: Feature: Folder Path Input & Validation (docs/frontend/features.md), Issue 4.
 */
import { useCallback, useEffect, useState } from "react";
import { useIngestionState } from "../state/providers";

/** Result returned by useFolderConfig: the prefill value, error/submitting state, and a submit function. */
export interface UseFolderConfigResult {
  /** The current watched folder path, from the initial GET prefill or the last successful submit. */
  defaultFolder: string;
  /** A readable message describing the last failed submission, or null if there is none. */
  error: string | null;
  /** True while a GET prefill or POST submission is in flight. */
  submitting: boolean;
  /** Submits a new folder path to the backend for validation and watching. Resolves true on success. */
  submit: (path: string) => Promise<boolean>;
}

/**
 * Extracts a human-readable error message from a folder-config error
 * response body, covering both the endpoint's own `{"detail": "..."}` shape
 * and FastAPI's validation-error `{"detail": [{"msg": "..."}]}` array shape.
 */
export function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (typeof first?.msg === "string") return first.msg;
    }
  }
  return "Failed to update the watched folder.";
}

/**
 * Loads the backend's default watched folder on mount and exposes a submit
 * function for changing it, tracking inline error and in-flight state. On
 * every successful GET/POST, dispatches RESET_FOLDER and STATUS_UPDATE
 * (watching) to the shared ingestion state.
 */
export function useFolderConfig(): UseFolderConfigResult {
  const { dispatch } = useIngestionState();
  const [defaultFolder, setDefaultFolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSubmitting(true);
    fetch("/api/folder-config")
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        // path is null on a fresh backend (no folder selected yet — the
        // backend no longer defaults to a WATCH_FOLDER): leave folderPath
        // null so the UI shows its folder chooser instead of claiming to
        // watch something.
        if (res.ok && typeof body.path === "string" && body.path.length > 0) {
          setDefaultFolder(body.path);
          dispatch({ type: "RESET_FOLDER", folderPath: body.path });
          dispatch({ type: "STATUS_UPDATE", status: { state: "watching" } });
        }
      })
      .catch(() => {
        // No acceptance criterion covers a failed prefill; leave the input blank.
      })
      .finally(() => {
        if (!cancelled) setSubmitting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const submit = useCallback(
    async (path: string): Promise<boolean> => {
      setSubmitting(true);
      try {
        const res = await fetch("/api/folder-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        const body = await res.json();
        if (res.ok) {
          setError(null);
          setDefaultFolder(body.path);
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
        setSubmitting(false);
      }
    },
    [dispatch]
  );

  return { defaultFolder, error, submitting, submit };
}
