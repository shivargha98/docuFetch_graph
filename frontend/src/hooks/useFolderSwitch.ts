/**
 * Thin wrapper around useFolderConfig whose `submit` additionally tears down
 * the graph and chat slices — RESET_GRAPH + GENERATING_START + RESET_SESSION
 * — whenever the submit SUCCEEDS, so stale nodes/messages from the previous
 * folder don't linger while the new folder's graph re-ingests.
 *
 * The trio is driven by the submit's success signal (useFolderConfig.submit
 * resolves true on success), NOT by watching folderPath for a
 * non-null -> different-non-null transition as earlier rounds did: with no
 * default folder at boot, the app's FIRST selection is a null -> path
 * transition, and a re-select of the current folder is a no-transition — the
 * old inference silently skipped both (no generating overlay, stale chat).
 * Every successful POST /api/folder-config re-ingests server-side, so the
 * trio is correct on every success. The initial GET prefill never passes
 * through submit and so never trips a teardown.
 * Source: Feature: Folder Switching & Session Reset (docs/frontend/features.md),
 * Issue 14; success-signal rework 2026-07-09.
 */
import { useCallback } from "react";
import { useFolderConfig, type UseFolderConfigResult } from "./useFolderConfig";
import { useGraphState, useChatState } from "../state/providers";

/**
 * Wraps useFolderConfig (same returned shape) with a submit that resets the
 * graph/chat slices and starts the generating overlay on every successful
 * folder switch.
 */
export function useFolderSwitch(): UseFolderConfigResult {
  const folderConfig = useFolderConfig();
  const { dispatch: dispatchGraph } = useGraphState();
  const { dispatch: dispatchChat } = useChatState();
  const { submit } = folderConfig;

  const submitAndReset = useCallback(
    async (path: string): Promise<boolean> => {
      const succeeded = await submit(path);
      if (succeeded) {
        dispatchGraph({ type: "RESET_GRAPH" });
        dispatchGraph({ type: "GENERATING_START" });
        dispatchChat({ type: "RESET_SESSION" });
      }
      return succeeded;
    },
    [submit, dispatchGraph, dispatchChat]
  );

  return { ...folderConfig, submit: submitAndReset };
}
