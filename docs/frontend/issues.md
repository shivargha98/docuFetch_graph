# Issues

_Generated from: docs/frontend/features.md_

---

## Issue 1: Static three-panel shell with dark neon/glow theme

**What to build:**
Scaffold the Vite + React app shell: a three-panel layout (folder panel | central graph area | chat panel) with panels stacking below the tablet-width breakpoint, styled with shadcn/ui primitives re-themed into the dark neon/glow visual identity. No live data yet — placeholder content in each panel is acceptable.

**Acceptance criteria:**
- [ ] At desktop width, the three panels render side-by-side with the central area taking the majority of horizontal space.
- [ ] Below the tablet-width breakpoint, panels stack vertically without clipping or overflow.
- [ ] All rendered surfaces use the dark neon/glow theme by default, with no light-theme styles or toggle present anywhere.

**Caveat (open question from PRD):** exact color/design token values (palette, glow intensity, glassmorphism parameters) are not fixed by the PRD — an implementation-time design pass is expected to refine the theme applied here.

**Design note:** Use the `frontend-design` skill for the theming portion of this issue — the dark neon/glow re-theme is the app's core visual identity, not just layout scaffolding.

**Blocked by:** None — can start immediately

---

## Issue 2: Global app state layer (graph / chat / ingestion reducers)

**What to build:**
Wire React Context + `useReducer` state into the shell from Issue 1, with one reducer per concern (graph state, chat/traversal state, ingestion/connection status), each in its own provider, so later features have a shared state substrate to read/write.

**Acceptance criteria:**
- [ ] Graph, chat/traversal, and ingestion state are each managed by an independent reducer, accessible from any panel via Context.
- [ ] A state change dispatched from one panel (e.g. a test action clearing ingestion state) is observable in another panel without prop-drilling.
- [ ] Each reducer can be unit-tested in isolation from the other two.

**Blocked by:** Issue 1

---

## Issue 3: WebSocket connection lifecycle

**What to build:**
Establish the WebSocket client used for chat traversal (and, pending the ingestion-status channel decision, potentially ingestion status too), handling connect, unexpected disconnect, automatic reconnect, and surfacing connection state into the ingestion/connection reducer from Issue 2.

**Acceptance criteria:**
- [ ] On app load with a folder already configured, a WebSocket connection attempt is made and its result (connected/failed) is reflected in app state.
- [ ] An unexpected disconnect updates connection state to a visibly indicated "disconnected" status rather than failing silently.
- [ ] Reconnection is attempted automatically after an unexpected disconnect.

**Caveat (open question from PRD):** the full WebSocket event/payload schema (event names, error events) is pinned to backend Issue 14 and not yet finalized; whether ingestion status shares this channel or uses a second one is also undecided.

**Blocked by:** Issue 2

---

## Issue 4: Folder path input, validation, and default prefill

**What to build:**
Add the folder-panel path input: pre-filled with the backend's default watched folder on first load, submitting a path to the backend's folder-configuration endpoint, and surfacing an inline error when the backend reports the path invalid or unreadable.

**Acceptance criteria:**
- [ ] On first load, the path input is pre-filled with the backend's default watched folder.
- [ ] Submitting a valid, existing path clears any prior error and updates ingestion state to reflect the new active folder.
- [ ] Submitting an invalid or unreadable path displays an inline error without crashing or blanking the panel.

**Caveat (open question from PRD):** the exact request/response shape of the folder-configuration endpoint is pinned to backend Issue 15 and not yet finalized.

**Blocked by:** Issue 2

---

## Issue 5: Live ingestion status display

**What to build:**
Show a live-updating status line in the folder panel (e.g. watching/idle, in-progress extraction) driven by backend-pushed events rather than polling, and confirm the folder panel's collapse/expand preserves the current status.

**Acceptance criteria:**
- [ ] The status line updates without a manual refresh as ingestion events arrive over the connection from Issue 3.
- [ ] The status line reflects at minimum: actively watching/idle, and progress on an in-flight file extraction.
- [ ] Collapsing and re-expanding the folder panel does not reset or lose the current status.

**Caveat (open question from PRD):** the full ingestion-status event schema and channel (shared with traversal events, or a second dedicated channel) is pinned to backend Issue 14 and not yet finalized.

**Blocked by:** Issue 3, Issue 4

---

## Issue 6: 3D concept graph initial render

**What to build:**
Fetch the current graph (nodes + typed edges) for the active folder from the backend's graph-read endpoint and render it as an orbit-able 3D WebGL scene using `react-force-graph` in 3D mode, including an empty-scene state when no graph exists yet.

**Acceptance criteria:**
- [ ] On loading a folder with an existing graph, all persisted nodes and edges render in the 3D scene.
- [ ] Each rendered edge visually reflects its relation-type label (e.g. via label text or distinct styling per relation type).
- [ ] The scene supports orbit, zoom, and pan camera controls.
- [ ] Loading a folder with no graph yet renders an empty scene without erroring.

**Caveat (open question from PRD):** the exact response payload shape (and pagination handling for large graphs) of the graph-read endpoint is pinned to backend Issue 16 and not yet finalized.

**Design note:** Use the `frontend-design` skill for this — node/edge colors and relation-type styling in the 3D scene are a core visual-identity decision, not just a rendering task.

**Blocked by:** Issue 2, Issue 4

---

## Issue 7: Live node fade-in on ingestion

**What to build:**
Animate newly discovered concept nodes fading/popping into the already-rendered 3D scene as ingestion adds them, driven by the same event stream powering ingestion status, without disturbing existing nodes' layout.

**Acceptance criteria:**
- [ ] A node added to the graph during an active session appears via a fade/pop-in animation rather than an abrupt appearance.
- [ ] Existing nodes do not visibly jump or re-layout when a new node fades in.

**Caveat (open question from PRD):** the event schema signaling new nodes during ingestion is pinned to backend Issue 14 and not yet finalized.

**Design note:** Use the `frontend-design` skill for this — the fade/pop-in motion treatment is part of the app's "living wiki" visual feel.

**Blocked by:** Issue 5, Issue 6

---

## Issue 8: Node click HUD detail overlay

**What to build:**
Open a floating HUD-style card anchored near a clicked node in the 3D scene, showing its description, source files, and linked concepts as clickable links, reprojecting its screen position every frame so it doesn't drift as the camera orbits/zooms.

**Acceptance criteria:**
- [ ] Clicking a node opens an overlay card showing that concept's description, source file(s), and linked concepts.
- [ ] Clicking a linked-concept link inside the overlay highlights/selects that concept in the graph.
- [ ] The overlay stays positioned near its node without visible drift or occlusion while the camera orbits or zooms.
- [ ] Clicking outside the overlay (or the node again) dismisses it.

**Design note:** Use the `frontend-design` skill for this — the floating HUD card's styling (glassmorphism, typography, anchoring feel) is core to the sci-fi HUD identity called out in the grill doc.

**Blocked by:** Issue 6

---

## Issue 9: Chat query submission and transcript

**What to build:**
Add the chat panel's text input and submit flow: sending a question over the WebSocket connection from Issue 3 and appending it to a visible transcript, with input disabled during an in-flight query.

**Acceptance criteria:**
- [ ] Submitting a non-empty question sends it over the active WebSocket connection and appends it to the visible transcript.
- [ ] The input is disabled (or queues) while a traversal is already in progress, preventing overlapping queries.
- [ ] Submitting an empty question is a no-op — no message sent, no transcript entry added.

**Blocked by:** Issue 3

---

## Issue 10: Live traversal trace and graph highlight sync

**What to build:**
On a submitted chat query, consume traversal-step WebSocket events to drive two synced effects: a live-updating collapsible trace block in the chat panel (collapsing into an expandable "show reasoning path" summary once the answer arrives) and sequential node/edge highlighting plus camera-follow on the 3D graph from Issue 6.

**Acceptance criteria:**
- [ ] Each traversal-step event received both updates the chat trace block with the newly visited concept and highlights the corresponding node/edge in the 3D scene, in event order.
- [ ] The camera pans/zooms toward each newly visited node rather than jumping instantly or staying static.
- [ ] Once the completion event is received, highlighting/camera-follow stops and the trace collapses into an expandable "show reasoning path" summary.
- [ ] Expanding a collapsed trace reveals the full visited-concept sequence for that query, and multiple past queries retain independently expandable traces.

**Caveat (open question from PRD):** the full WebSocket event/payload schema (event names beyond the illustrative visit/hop example, error events) is pinned to backend Issue 14 and not yet finalized.

**Design note:** Use the `frontend-design` skill for this — the highlight/glow color change, edge pulse animation, and trace visual treatment together are the centerpiece of the "watch the LLM fetch data" payoff.

**Blocked by:** Issue 6, Issue 9

---

## Issue 11: Answer display

**What to build:**
Render the backend's final 4-5 line answer as its own chat entry beneath the collapsed trace summary once the answer event arrives.

**Acceptance criteria:**
- [ ] The answer renders as a distinct chat entry positioned beneath that query's trace summary.
- [ ] The answer entry uses the normal (non-muted) accent styling.

**Design note:** Use the `frontend-design` skill for this — choosing the accent styling that reads as a "real answer" is a visual-treatment decision.

**Blocked by:** Issue 10

---

## Issue 12: No-match message display

**What to build:**
Render a visually distinct, muted/neutral chat entry when the backend reports no relevant document was found, with no trace block attached.

**Acceptance criteria:**
- [ ] A no-match response renders in a muted/neutral style clearly distinct from a normal answer's accent color.
- [ ] No trace block (collapsed or expanded) is rendered alongside a no-match message.
- [ ] The no-match message is visually distinguishable from a normal answer at a glance when scanning chat history.

**Design note:** Use the `frontend-design` skill for this — the muted/neutral styling needs to read as clearly distinct at a glance, an intentional visual-contrast decision.

**Blocked by:** Issue 9

---

## Issue 13: Collapsible chat panel

**What to build:**
Let the user collapse and re-expand the chat panel to give the 3D graph more screen space, without losing transcript content or interrupting an in-progress traversal.

**Acceptance criteria:**
- [ ] Collapsing the chat panel hides it and expands the graph view's available width.
- [ ] Re-expanding restores the chat panel with its prior transcript and scroll position intact.
- [ ] An in-progress traversal continues updating state while the chat panel is collapsed, visible correctly once re-expanded.

**Blocked by:** Issue 9

---

## Issue 14: Folder switching and session reset

**What to build:**
Let the user submit a new folder path after one is already loaded, tearing down the current graph view and chat session and starting fresh for the new folder — clearing displayed nodes/edges and transcript, and resetting ingestion status.

**Acceptance criteria:**
- [ ] Submitting a new valid folder path clears the currently displayed graph.
- [ ] Submitting a new valid folder path clears the chat transcript and starts a fresh session with no carried-over turn history.
- [ ] Ingestion status resets to reflect the new folder rather than showing stale status from the previous one.

**Caveat (open question from PRD):** pinned to backend Issue 15 (folder-configuration endpoint contract not yet finalized).

**Blocked by:** Issue 4, Issue 6, Issue 9

---

## Feature-to-issue coverage check

| Feature (features.md) | Covering issue(s) |
|---|---|
| Three-Panel Responsive Layout | Issue 1 |
| Dark Neon/Glow Theme System | Issue 1 |
| Global App State (Graph / Chat / Ingestion Slices) | Issue 2 |
| Folder Path Input & Validation | Issue 4 |
| Folder Switching & Session Reset | Issue 14 |
| Live Ingestion Status Display | Issue 5 |
| 3D Graph Rendering & Initial Load | Issue 6 |
| Live Node Fade-In on Ingestion | Issue 7 |
| Node Click HUD Detail Overlay | Issue 8 |
| Live Traversal Highlight & Camera-Follow | Issue 10 |
| Chat Query Submission | Issue 9 |
| Live Traversal Trace Block | Issue 10 |
| Answer Display | Issue 11 |
| No-Match Message Display | Issue 12 |
| Collapsible Chat Panel | Issue 13 |
| WebSocket Client & Connection Lifecycle | Issue 3 |

All 16 features from `features.md` map to at least one issue. No gaps found.

**Process note:** the issues-creator skill's normal flow includes an interactive "review the breakdown with the user" checkpoint before writing `issues.md`. Running autonomously as part of this PM loop (per the user's instruction to run PRD → features → issues in one pass and report back at the end), that checkpoint was substituted with the self-check table above rather than pausing mid-skill for human review. Flagging this so the user can request revisions to `issues.md` directly if the granularity or dependencies don't match expectations.
