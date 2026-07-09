# Folder Panel Cleanup — Design

**Date:** 2026-07-09
**Status:** Approved by user
**Source:** User bug report with screenshot (`issues_screenshots/Screenshot 2026-07-09 171349.png`): after an upload, the source badge overlaps the truncated folder name in the active-source row; the upload segment should be collapsible.

## Problem

1. **Active-source row overlap:** the row lays out `▸` + folder name (`min-w-0 truncate`) + badge (`shrink-0`). The uploaded-mode badge text — "Uploaded copy · re-drop to refresh" — is ~260px in the ~340px panel, crushing the name to one character and visually colliding with it.
2. **Fixed upload segment:** the drop zone + "Browse server folders…" button always occupy the panel, even after a folder is loaded and the user is done choosing.

## Design

### 1. Badge fix (FolderSourceBadge.tsx)

- Badge text shrinks to **"Linked"** / **"Uploaded copy"**.
- The "re-drop to refresh" guidance moves to a native `title` tooltip on the uploaded-mode badge ("Re-drop the folder to refresh its copy") — same tooltip pattern the folder name already uses for the full path.
- Row layout (glyph + truncating name + compact badge) is otherwise unchanged.

### 2. Collapsible upload segment (FolderPanel.tsx)

The drop zone, browse button, and their shared inline error region wrap in a lightweight disclosure — NOT a nested CollapsiblePanel (no second glass surface): a mono toggle row in the panel's existing vocabulary, `▸ Change folder…` collapsed / `▾ Change folder` expanded.

Behavior (auto-collapse mode, chosen by user over manual-only):
- No active folder (fresh app before prefill): segment expanded.
- Folder becomes active (prefill arrives, or an upload/browse succeeds): segment auto-collapses. Hook: the existing folderPath-change effect (folderPath changes only on flow success/prefill).
- Manual toggle always available; each later success re-collapses (success = "done choosing").
- While a flow is in flight the segment stays expanded (collapse only fires on success), keeping the drop zone's "Uploading…" copy visible.

New panel order: active-source row → FolderStatusLine → disclosure toggle → (segment when open). Status moves above the fold so the compact state reads "what's loaded + what it's doing".

### 3. Out of scope

No backend changes, no state-slice changes, no changes to FolderDropZone/FolderBrowserModal internals. All edits local to FolderPanel.tsx, FolderSourceBadge.tsx, and tests.

## Testing

- `FolderPanelRework.test.tsx` (extend): badge shows short text, uploaded badge tooltip carries the re-drop hint; segment expanded when no folder is active; auto-collapses on successful upload (drop zone leaves the DOM); toggle re-expands; a failed flow leaves the segment open with the error visible.
- Update any existing assertions on the old badge copy.
