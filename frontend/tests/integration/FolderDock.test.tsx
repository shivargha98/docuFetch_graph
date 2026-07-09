/**
 * Integration tests for FolderDock, the left-side overlay that replaced the
 * folder panel column: a fixed top-left bar (folder basename + source badge +
 * live ingestion status) that starts collapsed, expands into an overlay card
 * (drop zone + browse + error region) on click, and auto-collapses when an
 * ingestion flow succeeds. Renders the real dock under AppProviders with a
 * URL-routed fetch stub, exercising the real hooks: prefill -> "Linked"
 * default, modal Select -> POST + "Linked", drop upload -> "Uploaded copy".
 *
 * `collectFilesFromDataTransfer` is module-mocked (jsdom has no
 * webkitGetAsEntry); everything else in the lib stays real.
 * Source: docs/superpowers/specs/2026-07-09-folder-dock-design.md.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { resetAllMocks } from "../setup";
import { FolderDock } from "../../src/components/folder/FolderDock";
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
 * Installs a fetch stub routing the dock's endpoints by URL + method:
 * folder-config GET prefill (failable via the folderConfigGetFails override),
 * folder-config POST (echoes the submitted path, or the override response
 * when given), browse listings, the ingest upload POST, and the status
 * poll's graph read.
 */
function installFetch(overrides?: {
  folderConfigPost?: { status: number; body: unknown };
  folderConfigGetFails?: boolean;
}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.includes("/api/folder-config") && method === "GET") {
      if (overrides?.folderConfigGetFails) {
        return Promise.reject(new Error("prefill unavailable"));
      }
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

function renderDock() {
  return render(
    <AppProviders>
      <FolderDock />
    </AppProviders>
  );
}

/**
 * Expands the dock via its bar. Auto-collapse can land one effect-driven
 * re-render after the commit a findBy resolved on (and an upload success
 * collapses from two writers a microtask apart), so first flush pending
 * updates and wait for the collapsed state — then expand and confirm it stuck.
 */
async function expandDock() {
  await act(async () => {});
  const toggle = screen.getByTestId("folder-dock-toggle");
  await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(screen.getByTestId("folder-dock-toggle")).toHaveAttribute("aria-expanded", "true")
  );
}

/** Asserts the dock's card is collapsed (body CSS-hidden, bar not expanded). */
function expectCollapsed() {
  expect(screen.getByTestId("folder-dock-toggle")).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByTestId("folder-dock-body").className).toContain("hidden");
}

describe("FolderDock", () => {
  it("starts collapsed, with the bar showing the prefilled folder's basename, badge, and status", async () => {
    /**
     * Given the folder-config prefill resolves,
     * then the dock stays collapsed (its default) while the bar shows the
     * folder basename (full path as tooltip), the "Linked" badge, and the
     * live ingestion status.
     */
    installFetch();
    renderDock();

    expect(await screen.findByTestId("active-folder-name")).toHaveTextContent("vault");
    expect(screen.getByTestId("active-folder-name")).toHaveAttribute("title", "/home/user/vault");
    expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Linked");
    expect(screen.getByTestId("folder-status-line")).toBeInTheDocument();
    expectCollapsed();
  });

  it("shows an empty-state bar and still expands when no folder is active", async () => {
    /**
     * Given the prefill GET fails (no folder is active),
     * then the collapsed bar invites choosing a folder, and expanding
     * reveals the drop zone and browse button.
     */
    installFetch({ folderConfigGetFails: true });
    renderDock();

    expect(await screen.findByText("No folder — choose one")).toBeInTheDocument();
    expectCollapsed();

    await expandDock();

    expect(screen.getByTestId("folder-drop-zone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse server folders…" })).toBeInTheDocument();
  });

  it("submits a browsed path on Select, shows the 'Linked' badge, and auto-collapses", async () => {
    /**
     * Given the expanded dock's browse modal is open on /srv/docs,
     * when Select is clicked,
     * then the path is POSTed through the folder-config flow, the bar shows
     * the new basename with the "Linked" badge, and the dock collapses
     * (success = ingestion kicked off).
     */
    const fetchMock = installFetch();
    renderDock();
    await screen.findByTestId("active-folder-name");
    await expandDock();

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
    expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Linked");
    await waitFor(() => expectCollapsed());
  });

  it("switches the badge to 'Uploaded copy' with the re-drop tooltip after a drop upload, and auto-collapses", async () => {
    /**
     * Given collectFilesFromDataTransfer resolves a directory with supported
     * entries and the upload POST succeeds,
     * when a folder is dropped on the expanded dock's drop zone,
     * then the bar shows the uploaded copy's basename, the badge reads
     * "Uploaded copy" with the re-drop guidance tooltip, and the dock
     * collapses.
     */
    installFetch();
    const entries: UploadEntry[] = [{ file: new File(["hello"], "a.md"), relativePath: "a.md" }];
    collectMock.mockResolvedValue({ folderName: "notes", entries });
    renderDock();
    await screen.findByTestId("active-folder-name");
    await expandDock();

    fireEvent.drop(screen.getByTestId("folder-drop-zone"), { dataTransfer: { items: [{}] } });

    await waitFor(() =>
      expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Uploaded copy")
    );
    expect(screen.getByTestId("folder-source-badge")).toHaveAttribute(
      "title",
      expect.stringContaining("Re-drop")
    );
    expect(screen.getByTestId("active-folder-name")).toHaveTextContent("notes");
    await waitFor(() => expectCollapsed());
  });

  it("re-collapses when the SAME folder is re-dropped (re-drop to refresh)", async () => {
    /**
     * Given a folder has been uploaded and the dock re-expanded,
     * when the same folder is dropped again (upload returns the identical
     * path — folderPath never changes),
     * then the dock still auto-collapses: success must be visible even
     * without a folderPath transition.
     */
    installFetch();
    collectMock.mockResolvedValue({
      folderName: "notes",
      entries: [{ file: new File(["hello"], "a.md"), relativePath: "a.md" }],
    });
    renderDock();
    await screen.findByTestId("active-folder-name");
    await expandDock();

    fireEvent.drop(screen.getByTestId("folder-drop-zone"), { dataTransfer: { items: [{}] } });
    await waitFor(() => expectCollapsed());

    await expandDock();
    fireEvent.drop(screen.getByTestId("folder-drop-zone"), { dataTransfer: { items: [{}] } });

    await waitFor(() => expectCollapsed());
    expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Uploaded copy");
  });

  it("stays open with the error visible when a browse submit fails, then clears and collapses on a later success", async () => {
    /**
     * Given a browse Select whose folder-config POST fails with a 422,
     * then the card stays open with the detail in the shared error region
     * and the badge/mode unchanged;
     * when a subsequent drop upload succeeds,
     * then the error clears, the badge switches to "Uploaded copy", and the
     * dock collapses.
     */
    installFetch({
      folderConfigPost: { status: 422, body: { detail: "Folder path does not exist" } },
    });
    collectMock.mockResolvedValue({
      folderName: "notes",
      entries: [{ file: new File(["hello"], "a.md"), relativePath: "a.md" }],
    });
    renderDock();
    await screen.findByTestId("active-folder-name");
    await expandDock();

    fireEvent.click(screen.getByRole("button", { name: "Browse server folders…" }));
    await screen.findByTestId("folder-browser-modal");
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/srv/docs")
    );
    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    expect(await screen.findByTestId("folder-flow-error")).toHaveTextContent(
      "Folder path does not exist"
    );
    // A failed submit must not flip the mode, and must not collapse the card.
    expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Linked");
    expect(screen.getByTestId("folder-dock-toggle")).toHaveAttribute("aria-expanded", "true");

    fireEvent.drop(screen.getByTestId("folder-drop-zone"), { dataTransfer: { items: [{}] } });

    await waitFor(() =>
      expect(screen.getByTestId("folder-source-badge")).toHaveTextContent("Uploaded copy")
    );
    expect(screen.queryByTestId("folder-flow-error")).not.toBeInTheDocument();
    await waitFor(() => expectCollapsed());
  });
});
