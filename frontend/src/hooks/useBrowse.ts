/**
 * Hook backing the folder-browser modal: holds the current server-side
 * directory listing (current path, parent, drives, subdirectories) and
 * exposes `navigate(path?)` which fetches GET /api/browse — no argument for
 * the home directory, or a path to list that directory. On a rejected path
 * (422) or network failure the prior listing is kept intact and a readable
 * error string is surfaced instead.
 * Source: Task 7 brief (.superpowers/sdd/task-7-brief.md).
 */
import { useCallback, useState } from "react";

/** One subdirectory entry in a browse listing. */
export interface BrowseDir {
  /** The directory's display name. */
  name: string;
  /** The directory's absolute path, usable as a `navigate` target. */
  path: string;
}

/** Result returned by useBrowse: the current listing plus navigation state. */
export interface UseBrowseResult {
  /** Absolute path of the directory currently listed, or "" before the first fetch resolves. */
  currentPath: string;
  /** Absolute path of the parent directory, or null at a filesystem root. */
  parent: string | null;
  /** Drive roots (Windows), or null on platforms without drives. */
  drives: string[] | null;
  /** Subdirectories of the current path. */
  dirs: BrowseDir[];
  /** True while a listing fetch is in flight. */
  loading: boolean;
  /** A readable message for the last failed navigation, or null. Cleared on the next success. */
  error: string | null;
  /** Fetches the listing for `path`, or the home directory when omitted. */
  navigate: (path?: string) => Promise<void>;
}

/**
 * Extracts a human-readable error message from a browse error response body,
 * covering both a plain `{"detail": "..."}` shape and FastAPI's
 * validation-error `{"detail": [{"msg": "..."}]}` array shape.
 */
function extractBrowseError(body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (typeof first?.msg === "string") return first.msg;
    }
  }
  return "Could not open that folder.";
}

/**
 * Provides server-side directory browsing state for the folder-browser modal.
 * `navigate()` (no argument) lists the home directory; `navigate(path)` lists
 * `path`. A failed navigation keeps the previously loaded listing so the user
 * can keep browsing from where they were.
 */
export function useBrowse(): UseBrowseResult {
  const [currentPath, setCurrentPath] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [drives, setDrives] = useState<string[] | null>(null);
  const [dirs, setDirs] = useState<BrowseDir[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback(async (path?: string) => {
    setLoading(true);
    try {
      const url =
        path === undefined ? "/api/browse" : `/api/browse?path=${encodeURIComponent(path)}`;
      const res = await fetch(url);
      const body = await res.json();
      if (res.ok) {
        setCurrentPath(body.path);
        setParent(body.parent);
        setDrives(body.drives);
        setDirs(body.dirs);
        setError(null);
      } else {
        setError(extractBrowseError(body));
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { currentPath, parent, drives, dirs, loading, error, navigate };
}
