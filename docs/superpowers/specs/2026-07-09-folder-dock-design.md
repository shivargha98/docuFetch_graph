# Folder Dock (left-side overlay) — Design

**Date:** 2026-07-09
**Status:** Approved by user
**Source:** User request: folder ingestion should be a left-side button that opens an overlay card; after ingestion kicks off it collapses; starts collapsed.

## Layout

`App.tsx` becomes full-window `GraphView` + two fixed overlays: `FolderDock` (top-left) and `ChatDock` (bottom-right). The folder column is gone.

## FolderDock (`frontend/src/components/folder/FolderDock.tsx`, replaces FolderPanel)

- **Collapsed bar (default, incl. on app start):** `▸` + folder basename (truncating, full path as tooltip) + `FolderSourceBadge` + `FolderStatusLine`; with no active folder: "No folder — choose one" (no badge/status). The whole bar is the toggle (`folder-dock-toggle`, `aria-expanded`).
- **Expanded card** (below the bar, same fixed container, ~320px): `FolderDropZone`, "Browse server folders…" button, shared `folder-flow-error` region. The card IS the disclosure — the inner "Choose/Change folder" toggle from the panel era is removed. The bar keeps showing name/badge/status while expanded (no duplication in the card).
- **Auto-collapse on success:** folderPath-change effect + upload's direct success commit both set the dock closed (mode commit / error clear unchanged from FolderPanel). Failed flow keeps the card open with its error; in-flight upload keeps it open ("Uploading…").
- Hooks (`useIngestionStatus`, `useFolderSwitch`, `useFolderUpload`) at dock top level; card body CSS-hidden when collapsed, not unmounted (ChatDock pattern). `FolderBrowserModal` unchanged, rendered by the dock.
- `FolderStatusLine` loses its panel-era `mt-2` (dock bar is its only consumer now).

## Orphan cleanup

`CollapsiblePanel.tsx` + `CollapsiblePanel.test.tsx` deleted (last consumer gone). `FolderPanel.tsx` deleted. `FolderPanelRework.test.tsx` → `FolderDock.test.tsx`.

## Testing

- FolderDock: starts collapsed even with a prefill; bar shows basename/badge/status; empty-state bar copy; expand shows drop zone + browse; auto-collapse on upload success (different AND same path) and on browse success; failed browse keeps card open with error, later success clears; badge tooltip preserved.
- AppShell: graph alone in the flow row; both docks `fixed` overlays outside it.
