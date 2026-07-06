# Features

_Generated from: docs/frontend/prd.md_

## App Shell & Layout

### Feature: Three-Panel Responsive Layout

Renders the app as a folder panel, a dominant central 3D graph view, and a chat panel, stacking panels instead of sitting side-by-side below the tablet-width breakpoint.

**Acceptance criteria:**
- [ ] At desktop width, folder panel, graph view, and chat panel render side-by-side with the graph view taking the majority of horizontal space.
- [ ] Below the tablet-width breakpoint, panels stack vertically instead of overflowing or clipping.
- [ ] The graph view remains usable (not squeezed to an unusable size) at both breakpoints.

### Feature: Dark Neon/Glow Theme System

Applies a single dark, neon/glow Tailwind theme across all shadcn/ui-based components, with no light-mode variant or toggle exposed anywhere in the UI.

**Acceptance criteria:**
- [ ] All rendered surfaces (panels, buttons, inputs, overlays) use the dark neon/glow theme by default with no user-facing setting to change it.
- [ ] No light-theme styles or a theme-toggle control exist anywhere in the component tree.

**Open question (deferred from PRD):** exact color/design token values (palette, glow intensity, glassmorphism parameters) are not fixed — left to an implementation-time design pass.

**Design note:** Use the `frontend-design` skill for this — this feature *is* the app's visual identity (palette, glow intensity, glassmorphism), where templated shadcn defaults would undercut the "futuristic" steer.

### Feature: Global App State (Graph / Chat / Ingestion Slices)

Provides shared application state via React Context + `useReducer`, with one reducer per concern (graph state, chat/traversal state, ingestion/connection status), so the folder, graph, and chat panels stay consistent with each other.

**Acceptance criteria:**
- [ ] Switching folders updates ingestion, graph, and chat state together so no panel shows information from a previously loaded folder.
- [ ] A chat query's traversal events update both the graph reducer (for highlighting) and the chat reducer (for the trace block) from a single event stream.
- [ ] Each reducer (graph, chat/traversal, ingestion) can be reasoned about and tested independently of the others.

## Folder Panel

### Feature: Folder Path Input & Validation

Lets the user type an absolute folder path, pre-filled with the backend's default watched folder on first load, and shows an inline error when the backend reports the path is invalid or unreadable.

**Acceptance criteria:**
- [ ] On first load, the path input is pre-filled with the backend's default watched folder.
- [ ] Submitting a valid, existing path clears any prior error state and begins reflecting ingestion status.
- [ ] Submitting an invalid or unreadable path displays an inline error without crashing or blanking the panel.

**Open question (deferred from PRD):** the exact request/response shape of the folder-configuration endpoint this feature calls is pinned to backend Issue 15 and not yet finalized.

### Feature: Folder Switching & Session Reset

Lets the user submit a new folder path after one is already loaded, tearing down the current graph/chat view and starting fresh for the new folder.

**Acceptance criteria:**
- [ ] Submitting a new valid folder path clears the currently displayed graph and chat history.
- [ ] After switching, the chat panel starts a fresh session with no carried-over turn history from the previous folder.
- [ ] Ingestion status resets to reflect the new folder rather than showing stale status from the previous one.

**Open question (deferred from PRD):** pinned to backend Issue 15 (folder-configuration endpoint contract not yet finalized).

### Feature: Live Ingestion Status Display

Shows a live-updating status line in the folder panel (e.g. "Watching · 3 files queued", "Extracting concepts from notes.md...", "Idle · up to date") driven by backend events rather than polling.

**Acceptance criteria:**
- [ ] The status line updates without a manual page refresh as ingestion events arrive.
- [ ] The status line reflects at minimum: actively watching/idle, and progress on an in-flight extraction.
- [ ] The folder panel can be collapsed and re-expanded without losing the current status.

**Open question (deferred from PRD):** whether ingestion status rides the same WebSocket channel as chat traversal or a second dedicated channel is undecided, and the full event schema is pinned to backend Issue 14.

## Concept Graph View

### Feature: 3D Graph Rendering & Initial Load

Renders the current concept graph (nodes + typed edges) as an orbit-able 3D WebGL scene on load, using `react-force-graph` in 3D mode.

**Acceptance criteria:**
- [ ] On loading a folder with an existing graph, all persisted nodes and edges render in the 3D scene.
- [ ] Each rendered edge visually reflects its relation-type label (e.g. via label or distinct styling).
- [ ] The scene supports orbit/zoom/pan camera controls.
- [ ] Loading a folder with no graph yet (fresh ingestion) renders an empty scene without erroring.

**Open question (deferred from PRD):** the exact response payload shape (and pagination handling for large graphs) of the graph-read endpoint this feature calls is pinned to backend Issue 16.

**Design note:** Use the `frontend-design` skill for this — node/edge color and relation-type styling in the 3D scene is where the "futuristic" aesthetic lives or dies.

### Feature: Live Node Fade-In on Ingestion

Animates newly discovered concept nodes fading/popping into the 3D scene as ingestion adds them, instead of requiring a manual refresh.

**Acceptance criteria:**
- [ ] A node added to the underlying graph during an active session appears in the 3D scene via a fade/pop-in animation, not an abrupt appearance.
- [ ] Existing nodes are undisturbed (no re-layout jump) when a new node fades in.

**Open question (deferred from PRD):** the event schema signaling new nodes during ingestion is pinned to backend Issue 14.

**Design note:** Use the `frontend-design` skill for this — the fade/pop-in motion treatment is part of the "living wiki" visual feel, not just a state update.

### Feature: Node Click HUD Detail Overlay

Opens a floating HUD-style card anchored near a clicked node showing its description, source files, and linked concepts as clickable links, staying visually anchored as the camera orbits/zooms.

**Acceptance criteria:**
- [ ] Clicking a node opens an overlay card showing that concept's description, source file(s), and linked concepts.
- [ ] Clicking a linked-concept link inside the overlay navigates/highlights that concept in the graph.
- [ ] The overlay stays positioned near its node (no visible drift or occlusion) while the camera orbits or zooms.
- [ ] Clicking outside the overlay (or the node again) dismisses it.

**Design note:** Use the `frontend-design` skill for this — the floating HUD card's styling (glassmorphism, typography, anchoring feel) is explicitly called out in the grill doc as core to the sci-fi HUD identity.

### Feature: Live Traversal Highlight & Camera-Follow

During a chat query, sequentially highlights each visited node/edge in the 3D scene and pans/zooms the camera toward the newly visited node, per WebSocket traversal-step event.

**Acceptance criteria:**
- [ ] Each traversal-step event received highlights (glow/color change) the corresponding node in the scene, in event order.
- [ ] Each traversed edge shows a pulse/particle animation distinct from idle-state edges.
- [ ] The camera smoothly pans/zooms toward each newly visited node rather than jumping instantly or staying static.
- [ ] Highlighting/camera-follow stops cleanly once the completion event is received.

**Open question (deferred from PRD):** the full WebSocket event/payload schema (event names beyond the illustrative visit/hop example, error events) is pinned to backend Issue 14 and not yet finalized.

**Design note:** Use the `frontend-design` skill for this — the glow/highlight color change and pulse/particle animation are the centerpiece of the "watch the LLM fetch data" visual payoff.

## Chat Panel

### Feature: Chat Query Submission

Lets the user type and submit a question in the chat panel, initiating a traversal over the WebSocket connection.

**Acceptance criteria:**
- [ ] Submitting a non-empty question sends it over the active WebSocket connection and appends it to the visible chat transcript.
- [ ] The input is disabled or queues submissions while a traversal is already in progress, rather than allowing overlapping queries.
- [ ] Submitting an empty question is a no-op (no message sent, no transcript entry).

### Feature: Live Traversal Trace Block

Shows a live-updating collapsible trace above the pending answer (e.g. "Visiting: Neural Networks → Backpropagation → Gradient Descent") while traversal runs, then collapses into an expandable "show reasoning path" summary once the answer arrives.

**Acceptance criteria:**
- [ ] While traversal is in progress, the trace block updates with each newly visited concept in order.
- [ ] Once the completion event and answer arrive, the trace collapses into a summary state labeled for expansion (e.g. "show reasoning path").
- [ ] Expanding the collapsed trace reveals the full visited-concept sequence for that query.
- [ ] Multiple past queries in the transcript each retain their own independently expandable trace.

**Open question (deferred from PRD):** pinned to backend Issue 14 (WebSocket event schema not yet finalized).

**Design note:** Use the `frontend-design` skill for this — the live trace line and its collapse-to-summary treatment is a visible piece of chat UI polish, not just data plumbing.

### Feature: Answer Display

Renders the final 4-5 line answer beneath the collapsed trace once the backend's answer event arrives.

**Acceptance criteria:**
- [ ] The answer renders as its own distinct chat entry beneath the trace summary for that query.
- [ ] The answer entry uses the normal (non-muted) accent styling, distinguishing it from a no-match message.

**Design note:** Use the `frontend-design` skill for this — choosing the accent styling that reads as a "real answer" is a visual-treatment decision.

### Feature: No-Match Message Display

Renders a visually distinct, muted/neutral message when the backend reports no relevant document was found, with no trace block attached.

**Acceptance criteria:**
- [ ] A no-match response renders in a muted/neutral style clearly distinct from a normal answer's accent color.
- [ ] No trace block (collapsed or expanded) is rendered alongside a no-match message.
- [ ] The no-match message is immediately distinguishable from a normal answer when scanning chat history at a glance.

**Design note:** Use the `frontend-design` skill for this — the muted/neutral styling needs to read as clearly distinct at a glance, which is an intentional visual-contrast decision.

### Feature: Collapsible Chat Panel

Lets the user collapse and re-expand the chat panel to give the 3D graph more screen space.

**Acceptance criteria:**
- [ ] Collapsing the chat panel hides it and expands the graph view's available width.
- [ ] Re-expanding restores the chat panel with its prior transcript and scroll position intact.
- [ ] An in-progress traversal continues to update state while the chat panel is collapsed, so nothing is lost when it's re-expanded.

## Realtime Connectivity

### Feature: WebSocket Client & Connection Lifecycle

Establishes and manages the WebSocket connection used for chat traversal streaming (and, per the undecided ingestion-status design, possibly ingestion status too), handling connect/disconnect/reconnect.

**Acceptance criteria:**
- [ ] On app load with a valid folder configured, a WebSocket connection is established before a chat query can be submitted.
- [ ] A dropped connection surfaces a visible connection-status indication rather than silently failing a submitted query.
- [ ] Reconnection is attempted automatically after an unexpected disconnect.

**Open question (deferred from PRD):** the full event contract (event names/payload shapes, error events) is pinned to backend Issue 14 and not yet finalized; whether ingestion status shares this channel or uses a second one is also undecided.
