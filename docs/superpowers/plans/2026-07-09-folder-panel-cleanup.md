# Folder Panel Cleanup — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-09-folder-panel-cleanup-design.md` (approved)
**Scope:** `FolderSourceBadge.tsx`, `FolderPanel.tsx`, `FolderPanelRework.test.tsx`. No backend, no state-slice changes.

### Task 1: Tests first (extend `FolderPanelRework.test.tsx`)

- Update badge assertions: "Linked" / "Uploaded copy"; uploaded badge carries `title` tooltip "Re-drop the folder to refresh its copy".
- New collapse coverage:
  - after prefill the segment is collapsed: drop zone absent, toggle reads "Change folder…";
  - toggle click reveals drop zone + Browse button (toggle reads "Change folder", `aria-expanded`);
  - successful upload re-collapses the segment;
  - failed browse Select leaves the segment open with the error visible;
  - no active folder (prefill GET fails) → segment expanded with no toggle chrome.
- Update existing interaction tests to expand the segment first (shared helper).

### Task 2: Implement

- `FolderSourceBadge`: text "Linked"/"Uploaded copy"; `title` on uploaded mode; header comment updated.
- `FolderPanel`: reorder to active-source row → `FolderStatusLine` → toggle → segment (drop zone + browse + error). `sourceOpen` local state (initial `true`); the existing folderPath-change success effect also does `setSourceOpen(false)`. Toggle rendered only when a folder is active; mono `▸/▾` row, `data-testid="change-folder-toggle"`.

### Task 3: Verify

- rsync src+tests to `~/frontend-test`, `npx vitest run` there (full suite), `npx tsc -b` in `/workspace/frontend`.
