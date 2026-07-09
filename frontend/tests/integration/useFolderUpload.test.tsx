/**
 * Integration tests for useFolderUpload, which POSTs a collected set of
 * folder-relative files to the backend's folder-upload endpoint and, on
 * success, mirrors the returned path into ingestion state exactly like
 * useFolderConfig.submit does -- which in turn makes the already-wired
 * useFolderSwitch fire RESET_GRAPH/RESET_SESSION/GENERATING_START, since a
 * genuine (non-null -> different non-null) folderPath change is genuine
 * regardless of whether it came from a browse submit or an upload.
 * Source: Task 6 brief (frontend folder upload plumbing).
 *
 * These tests stub `fetch` locally with a queued sequence of responses
 * (prefill GET, then the upload POST), matching the pattern used by
 * tests/integration/useFolderSwitch.test.tsx, so the full provider tree
 * (including useFolderSwitch) can be exercised with a genuine prior folder
 * already loaded via the initial prefill.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetAllMocks } from "../setup";
import { useFolderUpload } from "../../src/hooks/useFolderUpload";
import { useFolderSwitch } from "../../src/hooks/useFolderSwitch";
import { useGraphState, useIngestionState, AppProviders } from "../../src/state/providers";
import type { UploadEntry } from "../../src/lib/folderUpload";

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

/** Queues the standard GET-prefill-then-POST-upload fetch sequence used by the tests below. */
function stubFetchSequence(uploadResponse: Response) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, { path: "/initial/folder" }))
    .mockResolvedValueOnce(uploadResponse);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderFolderUpload() {
  return renderHook(
    () => ({
      // Mount useFolderSwitch so the prefill runs and the genuine-switch
      // wiring (RESET_GRAPH/RESET_SESSION/GENERATING_START) is active.
      folderSwitch: useFolderSwitch(),
      upload: useFolderUpload(),
      graph: useGraphState(),
      ingestion: useIngestionState(),
    }),
    { wrapper: AppProviders }
  );
}

const sampleEntries: UploadEntry[] = [
  { file: new File(["hello"], "notes.md"), relativePath: "notes.md" },
  // The File's own name is the basename only (as a real FileSystemFileEntry's
  // file() returns), deliberately different from relativePath so the FormData
  // assertion can only pass if the hook names the part via relativePath.
  { file: new File(["world"], "todo.txt"), relativePath: "sub/todo.txt" },
];

describe("useFolderUpload", () => {
  it("uploads entries and, on success, updates ingestion folderPath and marks the graph as generating", async () => {
    /**
     * Given a folder is already loaded (via prefill) and fetch is mocked to
     * accept an upload,
     * when uploadEntries is called with a folder name and collected entries,
     * then ingestion state's folderPath updates to the returned path and the
     * graph's `generating` flag becomes true (via the genuine-switch wiring).
     */
    stubFetchSequence(jsonResponse(200, { path: "/srv/uploads/notes", status: "watching", mode: "uploaded" }));
    const { result } = renderFolderUpload();

    await waitFor(() => expect(result.current.ingestion.state.folderPath).toBe("/initial/folder"));

    await act(async () => {
      await result.current.upload.uploadEntries("notes", sampleEntries);
    });

    await waitFor(() => expect(result.current.ingestion.state.folderPath).toBe("/srv/uploads/notes"));
    expect(result.current.ingestion.state.status).toEqual({ state: "watching" });
    await waitFor(() => expect(result.current.graph.state.generating).toBe(true));
    expect(result.current.upload.error).toBeNull();
    expect(result.current.upload.uploading).toBe(false);
  });

  it("marks the graph as generating and resets it when re-uploading the SAME folder (re-drop to refresh)", async () => {
    /**
     * Given the active folder IS the uploaded copy (folderPath already equals
     * the path the upload returns) — the advertised re-drop-to-refresh flow,
     * when uploadEntries succeeds,
     * then `generating` still becomes true and the upload reports success,
     * even though folderPath never changes (the backend re-ingested and reset
     * the chat session server-side, so the same-path success must not be
     * invisible to the UI).
     */
    // Prefill resolves to the SAME path the upload will return.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { path: "/srv/uploads/notes" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { path: "/srv/uploads/notes", status: "watching", mode: "uploaded" })
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderFolderUpload();
    await waitFor(() => expect(result.current.ingestion.state.folderPath).toBe("/srv/uploads/notes"));

    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.upload.uploadEntries("notes", sampleEntries);
    });

    expect(succeeded).toBe(true);
    expect(result.current.ingestion.state.folderPath).toBe("/srv/uploads/notes");
    await waitFor(() => expect(result.current.graph.state.generating).toBe(true));
    expect(result.current.upload.error).toBeNull();
  });

  it("sends a FormData request with folder_name and each file appended under files using relativePath", async () => {
    const fetchMock = stubFetchSequence(
      jsonResponse(200, { path: "/srv/uploads/notes", status: "watching", mode: "uploaded" })
    );
    const { result } = renderFolderUpload();

    await waitFor(() => expect(result.current.ingestion.state.folderPath).toBe("/initial/folder"));

    await act(async () => {
      await result.current.upload.uploadEntries("notes", sampleEntries);
    });

    const uploadCall = fetchMock.mock.calls[1];
    expect(uploadCall[0]).toBe("/api/ingest/upload");
    const options = uploadCall[1] as RequestInit;
    expect(options.method).toBe("POST");
    const formData = options.body as FormData;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("folder_name")).toBe("notes");

    const files = formData.getAll("files") as File[];
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("notes.md");
    expect(files[1].name).toBe("sub/todo.txt");
  });

  it("surfaces the 422 detail as error and makes no ingestion/graph state change on failure", async () => {
    /**
     * Given a folder is already loaded, and fetch is mocked to reject the
     * upload with a 422,
     * when uploadEntries is called,
     * then `error` exposes the detail message and ingestion/graph state is
     * left untouched.
     */
    stubFetchSequence(jsonResponse(422, { detail: "No supported files (.md/.txt/.pdf) in upload" }));
    const { result } = renderFolderUpload();

    await waitFor(() => expect(result.current.ingestion.state.folderPath).toBe("/initial/folder"));

    await act(async () => {
      await result.current.upload.uploadEntries("notes", sampleEntries);
    });

    expect(result.current.upload.error).toBe("No supported files (.md/.txt/.pdf) in upload");
    expect(result.current.ingestion.state.folderPath).toBe("/initial/folder");
    expect(result.current.graph.state.generating).toBe(false);
    expect(result.current.upload.uploading).toBe(false);
  });
});
