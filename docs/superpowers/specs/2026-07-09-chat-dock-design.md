# Bottom-Docked Chat (LinkedIn-style) — Design

**Date:** 2026-07-09
**Status:** Approved by user
**Source:** User request: chat should not be a fixed right panel; LinkedIn-style bottom dock — press to expand, press again to collapse — so the graph can be viewed well.

## Layout

- `App.tsx`'s md-row becomes Folder panel + GraphView only; the graph permanently absorbs the old chat panel's ~384px.
- New `ChatDock` renders as a fixed overlay (`fixed bottom-0 right-4`, z above the graph panel) — floats over the scene, never affects layout flow.

## ChatDock component (`frontend/src/components/chat/ChatDock.tsx`)

Replaces `ChatPanel` (deleted). The folder panel's use of `CollapsiblePanel` is unchanged.

- **Header bar (always visible, ~320px):** `ConnectionStatusChip` + "Chat" title + chevron (`⌃` collapsed / `⌄` expanded). The whole bar is the toggle button. Starts **collapsed**.
- **Body (expanded):** existing `ChatTranscript` + `ChatInput`, unchanged, in a ~384px-wide window ~70vh tall above the bar. On small screens the window widens to `calc(100vw - 2rem)`.
- **Mount invariant:** `useChatSession` (WebSocket) lives at the dock's top level; the body is hidden with CSS when collapsed, never unmounted — preserving the socket, in-flight traversals, `useTraversalSync` (single-mount, module-level refs, lives inside `ChatTranscript`), and transcript scroll position. Same rationale as the old panel's `forceMount`.
- Test ids: `chat-dock`, `chat-dock-toggle`, `chat-dock-body`.

## Out of scope (deliberate)

No unread badge, no auto-expand on answer arrival, no elaborate animation, no multiple windows.

## Testing

- `ChatPanelCollapse.test.tsx` → `ChatDockToggle.test.tsx`: bar toggles expand/collapse; transcript + scroll position survive a collapse cycle; the WebSocket is not re-created on toggle; connection chip visible in both states.
- `AppShell.test.tsx`: chat absent from the panel row; dock present.
- `ChatTranscript`/`ChatInput`/traversal tests untouched.
