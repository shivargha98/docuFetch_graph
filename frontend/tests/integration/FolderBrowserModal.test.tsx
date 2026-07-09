/**
 * Integration tests for FolderBrowserModal + useBrowse: the folder-browser
 * dialog that fetches server-side directory listings from GET /api/browse and
 * lets the user navigate into subdirectories, jump up/home, switch drives,
 * and confirm a selection.
 * Source: Task 7 brief (.superpowers/sdd/task-7-brief.md).
 *
 * Backend contract (Task 2): GET /api/browse[?path=...] ->
 *   { path: str, parent: str|null, drives: string[]|null, dirs: [{name, path}] }
 * 422 -> { detail } on invalid path.
 *
 * `mockFetch` from tests/setup.ts has no /api/browse route and cannot express
 * response sequences, so fetch is stubbed locally with queued responses, the
 * same approach as useFolderConfig.test.tsx.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetAllMocks } from "../setup";
import { FolderBrowserModal } from "../../src/components/folder/FolderBrowserModal";

afterEach(() => {
  cleanup();
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

/** A browse listing body in the Task 2 contract shape. */
function listing(
  path: string,
  parent: string | null,
  dirs: { name: string; path: string }[],
  drives: string[] | null = null
) {
  return { path, parent, drives, dirs };
}

const homeListing = listing("/home/user", "/home", [
  { name: "projects", path: "/home/user/projects" },
  { name: "notes", path: "/home/user/notes" },
]);

describe("FolderBrowserModal", () => {
  it("fetches the home listing when opened and renders the current path readout", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, homeListing));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<FolderBrowserModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByTestId("folder-browser-modal")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/home/user")
    );
    // First (and only) request is the no-arg home fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/browse");
    expect(screen.getByRole("button", { name: "projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "notes" })).toBeInTheDocument();
  });

  it("navigates into a clicked directory: refetches with that path and updates the readout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, homeListing))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          listing("/home/user/projects", "/home/user", [
            { name: "docufetch", path: "/home/user/projects/docufetch" },
          ])
        )
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<FolderBrowserModal open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/home/user")
    );

    await userEvent.click(screen.getByRole("button", { name: "projects" }));

    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/home/user/projects")
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `/api/browse?path=${encodeURIComponent("/home/user/projects")}`
    );
    expect(screen.getByRole("button", { name: "docufetch" })).toBeInTheDocument();
  });

  it("disables the Up button at the filesystem root (parent null)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, listing("/", null, [{ name: "home", path: "/home" }])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<FolderBrowserModal open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/")
    );

    expect(screen.getByRole("button", { name: /up/i })).toBeDisabled();
  });

  it("fires onSelect with the current path when Select is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, homeListing));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onSelect = vi.fn();

    render(<FolderBrowserModal open onClose={vi.fn()} onSelect={onSelect} />);
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("/home/user")
    );

    await userEvent.click(screen.getByRole("button", { name: /select/i }));

    expect(onSelect).toHaveBeenCalledWith("/home/user");
  });

  it("moves focus into the dialog when opened", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, homeListing));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<FolderBrowserModal open onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("folder-browser-modal")).toHaveFocus());
  });

  it("calls onClose when Escape is pressed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, homeListing));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onClose = vi.fn();

    render(<FolderBrowserModal open onClose={onClose} onSelect={vi.fn()} />);
    // Focus lands in the dialog on open, so Escape works immediately.
    await waitFor(() => expect(screen.getByTestId("folder-browser-modal")).toHaveFocus());

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders drive chips when drives are provided and navigates to a drive on click", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          listing("C:\\Users\\user", "C:\\Users", [{ name: "docs", path: "C:\\Users\\user\\docs" }], [
            "C:\\",
            "D:\\",
          ])
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(200, listing("D:\\", null, [{ name: "media", path: "D:\\media" }], ["C:\\", "D:\\"]))
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<FolderBrowserModal open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("C:\\Users\\user")
    );

    const dDrive = screen.getByRole("button", { name: "D:\\" });
    expect(screen.getByRole("button", { name: "C:\\" })).toBeInTheDocument();

    await userEvent.click(dDrive);

    await waitFor(() =>
      expect(screen.getByTestId("browse-current-path")).toHaveTextContent("D:\\")
    );
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/browse?path=${encodeURIComponent("D:\\")}`);
  });
});
