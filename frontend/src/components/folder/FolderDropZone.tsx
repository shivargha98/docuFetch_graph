/**
 * Full-width folder drop zone for the folder panel: accepts a dragged-in
 * directory (via collectFilesFromDataTransfer) or a click that opens a hidden
 * `webkitdirectory` picker (via collectFilesFromInput), filters the collected
 * entries with filterSupported, and hands the folder name + supported entries
 * to its caller. A single-file drop shows an inline "Drop a folder, not a
 * file" hint instead of uploading, and a folder with no supported files shows
 * an inline error without initiating any request. Network submission lives in
 * useFolderUpload (wired by FolderDock); this component only collects.
 *
 * Design (frontend-design skill, invoked before writing this file): the zone
 * reads as the HUD's intake port — a dashed glass hairline field with mono
 * copy led by an ion pull-glyph. Drag-over "energizes" the port: the hairline
 * goes solid ion, the surface takes an ion wash, and the established
 * shadow-glow-ion lights up. Strictly the existing ion/muted vocabulary — no
 * new colors or faces.
 * Source: Task 8 brief (.superpowers/sdd/task-8-brief.md).
 */
import { useRef, useState, type ChangeEvent, type DragEvent, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import {
  collectFilesFromDataTransfer,
  collectFilesFromInput,
  filterSupported,
  type UploadEntry,
} from "../../lib/folderUpload";

interface FolderDropZoneProps {
  /** Called with the folder name and the supported (already filtered) entries once a valid folder is collected. */
  onUpload: (folderName: string, entries: UploadEntry[]) => void;
  /** True while an upload is in flight; the zone shows progress copy. */
  uploading?: boolean;
  /**
   * True while either folder flow (browse submit or upload) is in flight;
   * the zone ignores drops/clicks and suppresses the drag-over glow so a
   * second flow can't start while one is pending.
   */
  disabled?: boolean;
}

/**
 * Non-standard directory-picker attributes (not in React's input typings);
 * `webkitdirectory` is what makes the hidden input select a whole folder.
 */
const directoryPickerAttributes = {
  webkitdirectory: "",
} as InputHTMLAttributes<HTMLInputElement>;

/**
 * Renders the drop target with its hidden folder-picker input. Dropping a
 * directory or picking one via click funnels through the same filter-then-
 * report path; invalid drops surface inline hints instead of calling
 * `onUpload`.
 */
export function FolderDropZone({ onUpload, uploading = false, disabled = false }: FolderDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  /** Filters the collected entries and reports them, or shows the no-supported-files error. */
  function beginUpload(folderName: string, entries: UploadEntry[]) {
    const supported = filterSupported(entries);
    if (supported.length === 0) {
      setHint("No supported files (.md, .txt, .pdf) in that folder.");
      return;
    }
    setHint(null);
    onUpload(folderName, supported);
  }

  /** Collects a dropped DataTransfer; a non-directory drop shows the folder-only hint. */
  async function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const { folderName, entries } = await collectFilesFromDataTransfer(event.dataTransfer.items);
    if (folderName === null) {
      setHint("Drop a folder, not a file");
      return;
    }
    beginUpload(folderName, entries);
  }

  /** Marks the zone as an active drop target while a drag is over it (no glow while disabled). */
  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    // Always claim the drag (otherwise the browser handles the dropped files
    // itself), but don't show the inviting glow when drops would be ignored.
    event.preventDefault();
    if (disabled) return;
    setDragOver(true);
  }

  /** Clears the drag-over state, ignoring leave events fired by crossing the zone's own children. */
  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOver(false);
  }

  /** Maps a folder-picker selection to entries; the top path segment names the folder. Empty selection is a no-op. */
  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const collected = collectFilesFromInput(files);
    const folderName = collected[0].relativePath.split("/")[0];
    // Picker paths (webkitRelativePath) include the picked folder itself as
    // their top segment, while drop paths are rooted inside the folder.
    // Strip it so both flows upload folder-relative paths -- the backend
    // prefixes folder_name itself and would otherwise double-nest picked
    // uploads (uploads/<folder>/<folder>/...).
    const entries = collected.map((entry) => ({
      file: entry.file,
      relativePath: entry.relativePath.split("/").slice(1).join("/") || entry.file.name,
    }));
    beginUpload(folderName, entries);
    // Clear the selection so re-picking the same folder fires change again.
    event.target.value = "";
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        data-testid="folder-picker-input"
        className="hidden"
        onChange={handleInputChange}
        {...directoryPickerAttributes}
      />
      <button
        type="button"
        data-testid="folder-drop-zone"
        data-dragover={dragOver ? "true" : "false"}
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "group flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-3 py-5 text-center transition-all focus:outline-none focus-visible:border-ion focus-visible:ring-1 focus-visible:ring-ion",
          dragOver
            ? "border-ion bg-ion/10 shadow-glow-ion"
            : "border-glass-border hover:border-ion/60 hover:bg-ion/5"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "font-mono text-base leading-none transition-colors",
            dragOver ? "text-ion" : "text-muted group-hover:text-ion"
          )}
        >
          ⇣
        </span>
        <span className="font-mono text-xs text-text-secondary">
          {uploading ? "Uploading…" : "Drop a folder here — or click to pick one"}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          .md · .txt · .pdf
        </span>
      </button>
      {hint && (
        <p role="alert" data-testid="drop-zone-hint" className="font-mono text-xs text-red-400">
          {hint}
        </p>
      )}
    </div>
  );
}
