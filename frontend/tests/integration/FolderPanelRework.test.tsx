/**
 * Integration tests for the reworked FolderPanel: active-source line (folder
 * basename + FolderSourceBadge), the FolderDropZone upload flow, and the
 * "Browse server folders…" button driving FolderBrowserModal into
 * useFolderSwitch's submit. Renders the real panel under AppProviders with a
 * URL-routed fetch stub (folder-config GET/POST, browse, ingest upload,
 * graph), so the badge mode transitions are exercised through the real hooks:
 * prefill -> "Linked folder" default, modal Select -> POST + "Linked folder",
 * successful drop upload -> "Uploaded copy · re-drop to refresh".
 *
 * `collectFilesFromDataTransfer` is module-mocked (jsdom has no
 * webkitGetAsEntry); everything else in the lib stays real.
 * Source: Task 8 brief (.superpowers/sdd/task-8-brief.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { resetAllMocks } from "../setup";
import { FolderPanel } from "../../src/components/folder/FolderPanel";
import { AppProviders } from "../../src/state/providers";
import { collectFilesFromDataTransfer, type UploadEntry } from "../../src/lib/folderUpload";

vi.mock("../../src/lib/folderUpload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/folderUpload")>();
  return { ...actual, collectFilesFromDataTransfer: vi.fn() };
});

const collectMock = vi.mocked(collectFilesFromDataTransfer);

afterEach(() => {
  cleanup();
  resetAllMocks();
});

/** Builds a fake fetch Response resolving to the given status and JSON body. */
function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

/**
 * Installs a fetch stub routing the panel's endpoints by URL + method:
 * folder-config GET prefill, folder-config POST (echoes the submitted path,
 * or the override response when given), browse listings, the ingest upload
 * POST, and the status poll's graph read.
 */
function installFetch(overrides?: { folderConfigPost?: { status: number; body: unknown } }) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.includes("/api/folder-config") && method === "GET") {
      return jsonResponse(200, { path: "/home/user/vault" });
    }
    if (url.includes("/api/folder-config") && method === "POST") {
      if (overrides?.folderConfigPost) {
        return jsonResponse(overrides.folderConfigPost.status, overrides.folderConfigPost.body);
      }
      const { path } = JSON.parse(init?.body as string) as { path: string };
      return jsonResponse(200, { path, status: "watching" });
    }
    if (url.includes("/api/browse")) {
      return jsonResponse(200, { path: "/srv/docs", parent: "/srv", drives: null, dirs: [] });
    }
    if (url.includes("/api/ingest/upload")) {
      return jsonResponse(200, { path: "/srv/uploads/notes", status: "watching", mode: "uploaded" });
    }
    if (url.includes("/api/graph")) {
      return jsonResponse(200, { nodes: [], edges: [] });
    }
    return Promise.reject(new Error(`unstubbed fetch: ${url}`));
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderPanel() {
  return render(
    <AppProviders>
      <FolderPanel />
    </AppProviders>
  );
}

describe("FolderPanel rework", () => {
  it("shows the prefilled folder's basename with a 'Linked folder' badge by default", async () => {
    /**
     * Given the folder-config prefill resolves,
     * then the active-source line shows the folder basename and the badge
     * defaults to "Linked folder".
     */
    installFetch();
    renderPanel();

    expect(await screen.findByTestId("active-folder-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Linked folder");
    // The old free-text path input is gone.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("opens the folder-browser modal from the Browse button", async () => {
    /**
     * Given the panel is rendered,
     * when "Browse server folders…" is clicked,
     * then the FolderBrowserModal opens and lists the home directory.
     */
    installFetch();
    renderPanel();
    await screen.findByTestId("active-folder-name");

    fireEvent.click(screen.getByRole("button", { name: "Browse server folders…" }));

    expect(await screen.findByTestId("folder-browser-modal")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/srv/docs")
    );
  });

  it("submits the browsed path on Select, closes the modal, and shows the 'Linked folder' badge", async () => {
    /**
     * Given the modal is open on /srv/docs,
     * when Select is clicked,
     * then the path is POSTed through the folder-config flow, the modal
     * closes, and the active-source line shows the new basename with the
     * "Linked folder" badge.
     */
    const fetchMock = installFetch();
    renderPanel();
    await screen.findByTestId("active-folder-name");

    fireEvent.click(screen.getByRole("button", { name: "Browse server folders…" }));
    await screen.findByTestId("folder-browser-modal");
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/srv/docs")
    );

    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).includes("/api/folder-config") && init?.method === "POST"
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall![1]?.body as string)).toEqual({ path: "/srv/docs" });
    });
    expect(screen.queryByTestId("folder-browser-modal")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("active-folder-name")).toHaveTextContent("docs")
    );
    expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Linked folder");
  });

  it("switches the badge to 'Uploaded copy · re-drop to refresh' after a successful drop upload", async () => {
    /**
     * Given collectFilesFromDataTransfer resolves a directory with supported
     * entries and the upload POST succeeds,
     * when a folder is dropped on the drop zone,
     * then the active-source line shows the uploaded copy's basename and the
     * badge reads "Uploaded copy · re-drop to refresh".
     */
    installFetch();
    const entries: UploadEntry[] = [
      { file: new File(["hello"], "a.md"), relativePath: "a.md" },
    ];
    collectMock.mockResolvedValue({ folderName: "notes", entries });
    renderPanel();
    await screen.findByTestId("active-folder-name");

    fireEvent.drop(screen.getByTestId("folder-drop-zone"), { dataTransfer: { items: [{}] } });

    await waitFor(() =>
      expect(screen.getByTestId("folder-source-badge")).toHaveTextContent(
        "Uploaded copy · re-drop to refresh"
      )
    );
    expect(screen.getByTestId("active-folder-name")).toHaveTextContent("notes");
  });

  it("clears a browse failure from the shared error region once a later upload succeeds", async () => {
    /**
     * Given a browse Select whose folder-config POST fails with a 422 (the
     * detail lands in the shared error region),
     * when a subsequent drop upload succeeds,
     * then the shared error region clears (a success in EITHER flow clears
     * it, even though the failed hook still holds its own stale error) and
     * the badge switches to "Uploaded copy · re-drop to refresh".
     */
    installFetch({
      folderConfigPost: { status: 422, body: { detail: "Folder path does not exist" } },
    });
    collectMock.mockResolvedValue({
      folderName: "notes",
      entries: [{ file: new File(["hello"], "a.md"), relativePath: "a.md" }],
    });
    renderPanel();
    await screen.findByTestId("active-folder-name");

    fireEvent.click(screen.getByRole("button", { name: "Browse server folders…" }));
    await screen.findByTestId("folder-browser-modal");
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/srv/docs")
    );
    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    expect(await screen.findByTestId("folder-flow-error")).toHaveTextContent(
      "Folder path does not exist"
    );
    // A failed submit must not flip the mode.
    expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Linked folder");

    fireEvent.drop(screen.getByTestId("folder-drop-zone"), { dataTransfer: { items: [{}] } });

    await waitFor(() =>
      expect(screen.getByTestId("folder-source-badge")).toHaveTextContent(
        "Uploaded copy · re-drop to refresh"
      )
    );
    expect(screen.queryByTestId("folder-flow-error")).not.toBeInTheDocument();
  });
});
