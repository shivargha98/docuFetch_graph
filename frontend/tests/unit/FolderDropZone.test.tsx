/**
 * Unit tests for FolderDropZone: the folder panel's full-width drop target.
 * Covers: idle copy + hidden webkitdirectory picker, drag-over visual state
 * (via the data-dragover attribute), a mocked directory drop reaching
 * onUpload with only the supported (filtered) entries, a single-file drop
 * showing the "Drop a folder, not a file" hint without uploading, an
 * all-unsupported drop showing an inline error without uploading, and the
 * hidden picker path (click-to-open, change with webkitRelativePath files,
 * empty selection as a no-op).
 *
 * `collectFilesFromDataTransfer` is module-mocked (jsdom has no
 * webkitGetAsEntry); `filterSupported` and `collectFilesFromInput` stay real.
 * Source: Task 8 brief (.superpowers/sdd/task-8-brief.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { FolderDropZone } from "../../src/components/folder/FolderDropZone";
import { collectFilesFromDataTransfer, type UploadEntry } from "../../src/lib/folderUpload";

vi.mock("../../src/lib/folderUpload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/folderUpload")>();
  return { ...actual, collectFilesFromDataTransfer: vi.fn() };
});

const collectMock = vi.mocked(collectFilesFromDataTransfer);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Builds an UploadEntry whose File name is the basename of relativePath. */
function makeEntry(relativePath: string): UploadEntry {
  return {
    file: new File(["x"], relativePath.split("/").pop() ?? relativePath),
    relativePath,
  };
}

/** Fires a drop event on the zone with a stand-in DataTransfer items list. */
function dropOn(zone: HTMLElement) {
  fireEvent.drop(zone, { dataTransfer: { items: [{}] } });
}

describe("FolderDropZone", () => {
  it("renders the drop copy and a hidden webkitdirectory picker input", () => {
    /**
     * Given the drop zone is rendered idle,
     * then it shows the "Drop a folder here — or click to pick one" copy and
     * a hidden file input carrying the webkitdirectory attribute.
     */
    render(<FolderDropZone onUpload={vi.fn()} />);

    expect(screen.getByText("Drop a folder here — or click to pick one")).toBeInTheDocument();
    const input = screen.getByTestId("folder-picker-input");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("webkitdirectory");
  });

  it("reflects drag-over via data-dragover and resets on drag leave", () => {
    /**
     * Given the drop zone is rendered,
     * when a drag moves over it and then leaves,
     * then data-dragover flips to "true" and back to "false".
     */
    render(<FolderDropZone onUpload={vi.fn()} />);
    const zone = screen.getByTestId("folder-drop-zone");

    expect(zone).toHaveAttribute("data-dragover", "false");
    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute("data-dragover", "true");
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-dragover", "false");
  });

  it("calls onUpload with the folder name and only the supported entries on a directory drop", async () => {
    /**
     * Given collectFilesFromDataTransfer resolves a directory with a mix of
     * supported and unsupported files,
     * when a drop occurs,
     * then onUpload receives the folder name and the filterSupported subset.
     */
    const onUpload = vi.fn();
    const supported = makeEntry("a.md");
    collectMock.mockResolvedValue({
      folderName: "notes",
      entries: [supported, makeEntry("img/pic.png")],
    });
    render(<FolderDropZone onUpload={onUpload} />);

    dropOn(screen.getByTestId("folder-drop-zone"));

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith("notes", [supported]));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("shows the 'Drop a folder, not a file' hint and never uploads on a single-file drop", async () => {
    /**
     * Given collectFilesFromDataTransfer resolves { folderName: null } (a
     * non-directory drop),
     * when the drop occurs,
     * then the inline hint appears and onUpload is never called.
     */
    const onUpload = vi.fn();
    collectMock.mockResolvedValue({ folderName: null, entries: [] });
    render(<FolderDropZone onUpload={onUpload} />);

    dropOn(screen.getByTestId("folder-drop-zone"));

    expect(await screen.findByText("Drop a folder, not a file")).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("shows an inline error and never uploads when no dropped file is supported", async () => {
    /**
     * Given a dropped directory whose entries are all filtered out,
     * when the drop occurs,
     * then an inline no-supported-files error appears and onUpload is never
     * called (no request is initiated).
     */
    const onUpload = vi.fn();
    collectMock.mockResolvedValue({ folderName: "pics", entries: [makeEntry("pic.png")] });
    render(<FolderDropZone onUpload={onUpload} />);

    dropOn(screen.getByTestId("folder-drop-zone"));

    expect(
      await screen.findByText("No supported files (.md, .txt, .pdf) in that folder.")
    ).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("opens the hidden picker on click and uploads picked files with the top path segment stripped", async () => {
    /**
     * Given the zone is clicked (opening the hidden webkitdirectory input)
     * and the input reports files with webkitRelativePath set,
     * then onUpload receives the top path segment as the folder name and
     * entries whose relativePath has that segment stripped (rooted inside
     * the picked folder, matching the drop flow -- the backend prefixes the
     * folder name itself, so keeping it would double-nest the upload).
     */
    const onUpload = vi.fn();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    render(<FolderDropZone onUpload={onUpload} />);

    fireEvent.click(screen.getByTestId("folder-drop-zone"));
    expect(clickSpy).toHaveBeenCalled();

    const nested = new File(["hello"], "a.md");
    Object.defineProperty(nested, "webkitRelativePath", { value: "proj/sub/a.md" });
    const atRoot = new File(["world"], "b.md");
    Object.defineProperty(atRoot, "webkitRelativePath", { value: "proj/b.md" });
    fireEvent.change(screen.getByTestId("folder-picker-input"), {
      target: { files: [nested, atRoot] },
    });

    await waitFor(() =>
      expect(onUpload).toHaveBeenCalledWith("proj", [
        expect.objectContaining({ relativePath: "sub/a.md" }),
        expect.objectContaining({ relativePath: "b.md" }),
      ])
    );
  });

  it("does nothing when the picker selection is empty", () => {
    /**
     * Given the hidden picker's change event fires with no files,
     * then no upload starts and no hint appears.
     */
    const onUpload = vi.fn();
    render(<FolderDropZone onUpload={onUpload} />);

    fireEvent.change(screen.getByTestId("folder-picker-input"), { target: { files: [] } });

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
