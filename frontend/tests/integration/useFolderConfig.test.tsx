/**
 * Integration tests for useFolderConfig, which submits the folder path to the
 * backend's folder-configuration endpoint and surfaces validation results.
 * Source: Feature: Folder Path Input & Validation (docs/frontend/features.md), Issue 4.
 *
 * Caveat: the mocked request/response payload shape used throughout this file is
 * illustrative and provisional, pending backend Issue 15. These tests assert only
 * the fixed behavior (success clears error and updates state; failure surfaces an
 * error), not a specific field-level schema.
 *
 * `mockFetch` from tests/setup.ts routes every `/api/folder-config` request (GET
 * and POST alike) to the same stubbed response, so it can't express "GET succeeds,
 * then POST fails, then POST succeeds" within one test. These tests stub `fetch`
 * locally with a queued sequence of responses instead, per the brief's guidance.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetAllMocks } from "../setup";
import { useFolderConfig } from "../../src/hooks/useFolderConfig";
import { useIngestionState, AppProviders } from "../../src/state/providers";

afterEach(() => {
  resetAllMocks();
});

/** Builds a fake fetch Response resolving to the given status and JSON body. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function renderFolderConfig() {
  return renderHook(
    () => ({ folder: useFolderConfig(), ingestion: useIngestionState() }),
    { wrapper: AppProviders }
  );
}

describe("useFolderConfig", () => {
  it("leaves folderPath null when the prefill reports no active folder (path: null)", async () => {
    /**
     * Given a fresh backend with no folder ever selected (GET returns
     * {path: null} — the backend no longer defaults to a WATCH_FOLDER),
     * when the prefill resolves,
     * then folderPath stays null and no "watching" status is claimed, so
     * the UI shows its folder chooser instead of a folder nobody chose.
     */
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { path: null }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderFolderConfig();

    await waitFor(() => expect(result.current.folder.submitting).toBe(false));
    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.ingestion.state.folderPath).toBeNull();
    expect(result.current.ingestion.state.status).toEqual({ state: "idle" });
  });

  it("submits a valid folder path and clears prior error state", async () => {
    /**
     * Given a prior inline error is set, and fetch is mocked to return a success
     * response for the folder-configuration endpoint,
     * when a valid path is submitted,
     * then the prior error state is cleared and ingestion state updates to reflect
     * the newly active folder.
     *
     * Source: Feature: Folder Path Input & Validation — criterion 2
     */
    const fetchMock = vi
      .fn()
      // initial GET prefill on mount
      .mockResolvedValueOnce(jsonResponse(200, { path: "/initial/folder" }))
      // first submit: invalid path, establishes a prior error
      .mockResolvedValueOnce(jsonResponse(422, { detail: "Path does not exist" }))
      // second submit: valid path
      .mockResolvedValueOnce(jsonResponse(200, { path: "/valid/folder", status: "watching" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderFolderConfig();

    await waitFor(() => expect(result.current.folder.defaultFolder).toBe("/initial/folder"));

    await act(async () => {
      await result.current.folder.submit("/bad/folder");
    });
    expect(result.current.folder.error).toBe("Path does not exist");

    await act(async () => {
      await result.current.folder.submit("/valid/folder");
    });

    expect(result.current.folder.error).toBeNull();
    expect(result.current.ingestion.state.folderPath).toBe("/valid/folder");
    expect(result.current.ingestion.state.status).toEqual({ state: "watching" });
  });

  it("surfaces an inline error and does not crash when the backend reports an invalid/unreadable path", async () => {
    /**
     * Given fetch is mocked to return an error response for the folder-configuration endpoint,
     * when an invalid path is submitted,
     * then an inline error is displayed and the component tree remains mounted and interactive.
     *
     * Source: Feature: Folder Path Input & Validation — criterion 3
     */
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { path: "/initial/folder" }))
      .mockResolvedValueOnce(jsonResponse(422, { detail: "Path is not a directory" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderFolderConfig();

    await waitFor(() => expect(result.current.folder.defaultFolder).toBe("/initial/folder"));

    await act(async () => {
      await result.current.folder.submit("/not/a/directory");
    });

    expect(result.current.folder.error).toBe("Path is not a directory");
    // The ingestion state from the earlier successful prefill remains intact —
    // the failed submit did not tear down or blank the panel's data.
    expect(result.current.ingestion.state.folderPath).toBe("/initial/folder");
    expect(result.current.folder.submitting).toBe(false);
  });
});
