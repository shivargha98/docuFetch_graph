/**
 * Thin wrapper around useFolderConfig that additionally tears down the graph
 * and chat slices whenever the watched folder actually switches (as opposed
 * to the very first prefill on mount), so stale nodes/messages from the
 * previous folder don't linger while the new folder's graph refetches.
 * Source: Feature: Folder Switching & Session Reset (docs/frontend/features.md), Issue 14.
 */
import { useEffect, useRef } from "react";
import { useFolderConfig, type UseFolderConfigResult } from "./useFolderConfig";
import { useGraphState, useChatState, useIngestionState } from "../state/providers";

/**
 * Wraps useFolderConfig unchanged (same returned shape), and watches the
 * shared ingestion state's `folderPath` for a genuine switch -- a change
 * from one non-null path to a different non-null path, which only happens
 * after a successful `submit` (the initial GET prefill goes null -> path,
 * and a failed submit leaves `folderPath` unchanged, so neither trips this).
 * On a genuine switch, dispatches RESET_GRAPH and RESET_SESSION so the old
 * folder's graph/transcript clear immediately, before/as useGraphData's own
 * folderPath-keyed refetch completes.
 */
export function useFolderSwitch(): UseFolderConfigResult {
  const folderConfig = useFolderConfig();
  const { dispatch: dispatchGraph } = useGraphState();
  const { dispatch: dispatchChat } = useChatState();
  const {
    state: { folderPath },
  } = useIngestionState();
  const previousFolderPathRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousFolderPathRef.current;
    if (previous !== null && folderPath !== null && folderPath !== previous) {
      dispatchGraph({ type: "RESET_GRAPH" });
      dispatchChat({ type: "RESET_SESSION" });
    }
    previousFolderPathRef.current = folderPath;
  }, [folderPath, dispatchGraph, dispatchChat]);

  return folderConfig;
}
