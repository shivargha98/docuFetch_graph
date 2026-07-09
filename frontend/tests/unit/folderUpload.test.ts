/**
 * Unit tests for the pure folder-upload helpers: filterSupported (extension
 * filtering), collectFilesFromInput (webkitRelativePath mapping for the
 * folder-picker input), and collectFilesFromDataTransfer (recursive
 * FileSystemEntry tree walking for drag-and-drop, including multi-batch
 * readEntries draining and the file-only-drop no-op case).
 * Source: Task 6 brief (frontend folder upload plumbing).
 */
import { describe, it, expect } from "vitest";
import {
  filterSupported,
  collectFilesFromInput,
  collectFilesFromDataTransfer,
  type UploadEntry,
} from "../../src/lib/folderUpload";

describe("filterSupported", () => {
  it("keeps only .md/.txt/.pdf entries case-insensitively", () => {
    const entries: UploadEntry[] = [
      { file: new File(["a"], "notes.MD"), relativePath: "notes.MD" },
      { file: new File(["b"], "readme.txt"), relativePath: "sub/readme.txt" },
      { file: new File(["c"], "report.PDF"), relativePath: "report.PDF" },
      { file: new File(["d"], "image.png"), relativePath: "image.png" },
      { file: new File(["e"], "archive.zip"), relativePath: "archive.zip" },
    ];

    const result = filterSupported(entries);

    expect(result.map((e) => e.relativePath)).toEqual(["notes.MD", "sub/readme.txt", "report.PDF"]);
  });
});

describe("collectFilesFromInput", () => {
  it("maps each file's webkitRelativePath, falling back to name when absent", () => {
    const fileWithRelPath = new File(["a"], "a.md");
    Object.defineProperty(fileWithRelPath, "webkitRelativePath", {
      value: "myfolder/a.md",
    });
    const fileWithoutRelPath = new File(["b"], "b.txt");
    Object.defineProperty(fileWithoutRelPath, "webkitRelativePath", {
      value: "",
    });

    const fileList = {
      0: fileWithRelPath,
      1: fileWithoutRelPath,
      length: 2,
      *[Symbol.iterator]() {
        yield fileWithRelPath;
        yield fileWithoutRelPath;
      },
    } as unknown as FileList;

    const result = collectFilesFromInput(fileList);

    expect(result).toEqual([
      { file: fileWithRelPath, relativePath: "myfolder/a.md" },
      { file: fileWithoutRelPath, relativePath: "b.txt" },
    ]);
  });
});

/** Builds a mock FileSystemFileEntry whose file() callback resolves with the given File. */
function mockFileEntry(name: string, file: File): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file(successCallback: (file: File) => void) {
      successCallback(file);
    },
  } as unknown as FileSystemFileEntry;
}

/**
 * Builds a mock FileSystemDirectoryEntry whose createReader().readEntries()
 * drains the given batches one at a time (simulating the browser's real
 * multi-callback readEntries behavior), then returns an empty batch.
 */
function mockDirEntry(name: string, batches: FileSystemEntry[][]): FileSystemDirectoryEntry {
  let callIndex = 0;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      return {
        readEntries(successCallback: (entries: FileSystemEntry[]) => void) {
          const batch = callIndex < batches.length ? batches[callIndex] : [];
          callIndex += 1;
          successCallback(batch);
        },
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}

/** Builds a mock DataTransferItem wrapping the given webkitGetAsEntry() result. */
function mockItem(entry: FileSystemEntry | null): DataTransferItem {
  return { webkitGetAsEntry: () => entry } as unknown as DataTransferItem;
}

describe("collectFilesFromDataTransfer", () => {
  it("recursively flattens a nested directory tree, draining readEntries across multiple batches", async () => {
    const fileA = new File(["a"], "a.txt");
    const fileB = new File(["b"], "b.md");

    const fileEntryA = mockFileEntry("a.txt", fileA);
    const subdirFileEntryB = mockFileEntry("b.md", fileB);
    // Subdirectory's reader yields a single non-empty batch, then [] (end).
    const subdirEntry = mockDirEntry("subdir", [[subdirFileEntryB]]);
    // Root reader drains across two non-empty batches — [fileA], then
    // [subdir] — before the empty terminating batch, exercising the
    // multi-batch readEntries draining loop.
    const rootEntry = mockDirEntry("myfolder", [[fileEntryA], [subdirEntry]]);

    const items = [mockItem(rootEntry)] as unknown as DataTransferItemList;

    const result = await collectFilesFromDataTransfer(items);

    expect(result.folderName).toBe("myfolder");
    expect(result.entries).toEqual(
      expect.arrayContaining([
        { file: fileA, relativePath: "a.txt" },
        { file: fileB, relativePath: "subdir/b.md" },
      ])
    );
    expect(result.entries).toHaveLength(2);
  });

  it("returns folderName null and no entries when a single file (not a directory) is dropped", async () => {
    const fileEntry = mockFileEntry("standalone.txt", new File(["x"], "standalone.txt"));
    const items = [mockItem(fileEntry)] as unknown as DataTransferItemList;

    const result = await collectFilesFromDataTransfer(items);

    expect(result).toEqual({ folderName: null, entries: [] });
  });
});
