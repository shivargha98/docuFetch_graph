# Test Suite

_Generated from: prd.md, features.md, issues.md_

_Stack (per `grill_doc_roadmap.md`): Vitest + React Testing Library for unit/integration tests with `fetch`/WebSocket mocked at the network boundary; Playwright for a small set of E2E flows against the real running backend._

**A note on open backend contracts:** three integration points are pinned to backend issues that aren't finalized yet — the WebSocket traversal-event schema (backend Issue 14), the folder-configuration endpoint shape (backend Issue 15), and the graph-read endpoint shape (backend Issue 16). Tests that exercise these boundaries assert only the *behavior* that is already fixed by the PRD/issues (e.g. "a successful submission clears the error state," "each traversal-step event highlights the next node in order") against an illustrative mocked payload. Each such test is flagged below with **Caveat** and the mock payload is commented as provisional — these tests, and the `mockFetch`/`mockWebSocketEvents` fixtures backing them, must be revisited once the real contract lands.

---

## Unit Tests

### AppShell

#### Test: Renders three panels side-by-side at desktop width
**Type:** Unit
**Source:** Feature: Three-Panel Responsive Layout — criterion 1
**Given:** The app shell is rendered at a desktop viewport width
**When:** The initial render completes
**Then:**
- [ ] The folder panel, graph view, and chat panel are all present in the DOM simultaneously
- [ ] The graph view's container occupies the majority of the horizontal space relative to the two side panels

#### Test: Stacks panels vertically below the tablet-width breakpoint
**Type:** Unit
**Source:** Feature: Three-Panel Responsive Layout — criterion 2
**Given:** The app shell is rendered at a viewport width below the tablet breakpoint
**When:** The initial render completes
**Then:**
- [ ] The three panels render in a stacked (vertical) layout rather than side-by-side
- [ ] No panel is clipped or overflows its container

#### Test: Keeps the graph view at a usable size at both breakpoints
**Type:** Unit
**Source:** Feature: Three-Panel Responsive Layout — criterion 3
**Given:** The app shell is rendered first at desktop width, then at tablet width
**When:** The viewport width changes between the two renders
**Then:**
- [ ] The graph view's rendered dimensions stay above a defined minimum usable size at both widths

---

### ThemeProvider

#### Test: Applies the dark neon/glow theme by default with no light-theme styles present
**Type:** Unit
**Source:** Feature: Dark Neon/Glow Theme System — criterion 1
**Given:** The app is rendered with no theme preference configured
**When:** Any themed surface (panel, button, input) is inspected
**Then:**
- [ ] The rendered surface carries the dark neon/glow theme's class/token set
- [ ] No light-theme class or token set is present anywhere in the rendered tree

**Caveat (open item from PRD):** exact color/design token values are not fixed by the PRD (implementation-time design pass) — this test asserts theme *application*, not specific palette values.

#### Test: Renders no theme-toggle control anywhere in the component tree
**Type:** Unit
**Source:** Feature: Dark Neon/Glow Theme System — criterion 2
**Given:** The full app shell is rendered
**When:** The rendered tree is queried for a theme-toggle control
**Then:**
- [ ] No element matching a theme-toggle role/label is found

---

### State Reducers (graph / chat / ingestion)

#### Test: graphReducer adds a node without mutating the previous state
**Type:** Unit
**Source:** Feature: Global App State (Graph / Chat / Ingestion Slices)
**Given:** An existing graph state with N nodes
**When:** An ADD_NODE action is dispatched
**Then:**
- [ ] The returned state contains N+1 nodes
- [ ] The original state object passed in is left unmodified

#### Test: graphReducer clears all nodes/edges on a RESET_GRAPH action
**Type:** Unit
**Source:** Feature: Folder Switching & Session Reset — criterion 1
**Given:** An existing graph state with nodes and edges
**When:** A RESET_GRAPH action is dispatched
**Then:**
- [ ] The returned state has zero nodes and zero edges

#### Test: chatReducer appends a new message to the transcript
**Type:** Unit
**Source:** Feature: Chat Query Submission — criterion 1
**Given:** An existing chat state with an existing transcript
**When:** an ADD_MESSAGE action is dispatched
**Then:**
- [ ] The returned state's transcript includes the new message appended at the end

#### Test: chatReducer appends a trace step to the in-progress trace
**Type:** Unit
**Source:** Feature: Live Traversal Trace Block — criterion 1
**Given:** A chat state with an in-progress (uncollapsed) trace
**When:** a TRACE_STEP action is dispatched with a newly visited concept
**Then:**
- [ ] The returned state's trace sequence includes the new concept appended in order

#### Test: chatReducer collapses the trace into a reasoning-path summary on a TRACE_COMPLETE action
**Type:** Unit
**Source:** Feature: Live Traversal Trace Block — criterion 2
**Given:** A chat state with an in-progress trace and no answer yet
**When:** a TRACE_COMPLETE action is dispatched
**Then:**
- [ ] The returned state marks that query's trace as collapsed/summarized rather than live-updating

#### Test: chatReducer clears the transcript on a RESET_SESSION action
**Type:** Unit
**Source:** Feature: Folder Switching & Session Reset — criterion 2
**Given:** A chat state with prior transcript history
**When:** a RESET_SESSION action is dispatched
**Then:**
- [ ] The returned state's transcript is empty

#### Test: ingestionReducer updates status text on a STATUS_UPDATE action
**Type:** Unit
**Source:** Feature: Live Ingestion Status Display — criterion 2
**Given:** An ingestion state with a prior status value
**When:** a STATUS_UPDATE action is dispatched with a new status
**Then:**
- [ ] The returned state reflects the new status value

#### Test: ingestionReducer resets to idle on a RESET_FOLDER action
**Type:** Unit
**Source:** Feature: Folder Switching & Session Reset — criterion 3
**Given:** An ingestion state mid-extraction
**When:** a RESET_FOLDER action is dispatched
**Then:**
- [ ] The returned state reflects an idle/reset status for the newly submitted folder

---

### Folder Panel Components

#### Test: Pre-fills the input with the provided default watched folder on first render
**Type:** Unit
**Source:** Feature: Folder Path Input & Validation — criterion 1
**Given:** A `defaultFolder` prop is passed to the folder path input
**When:** The component renders for the first time
**Then:**
- [ ] The input's value equals the provided `defaultFolder`

#### Test: Displays an inline error message when an error prop is set
**Type:** Unit
**Source:** Feature: Folder Path Input & Validation — criterion 3
**Given:** An `error` prop with a message is passed to the folder path input
**When:** The component renders
**Then:**
- [ ] The error message is visible near the input
- [ ] The panel does not unmount or blank out any other content

---

### Folder Status Line

#### Test: Renders a "Watching" status variant
**Type:** Unit
**Source:** Feature: Live Ingestion Status Display — criterion 2
**Given:** A status prop of `{ state: "watching", queued: 3 }`
**When:** The status line renders
**Then:**
- [ ] The rendered text reflects "watching" with the queued count

#### Test: Renders an "Idle · up to date" status variant
**Type:** Unit
**Source:** Feature: Live Ingestion Status Display — criterion 2
**Given:** A status prop of `{ state: "idle" }`
**When:** The status line renders
**Then:**
- [ ] The rendered text reflects an idle/up-to-date state

#### Test: Renders an in-progress extraction status with the current filename
**Type:** Unit
**Source:** Feature: Live Ingestion Status Display — criterion 2
**Given:** A status prop of `{ state: "extracting", file: "notes.md" }`
**When:** The status line renders
**Then:**
- [ ] The rendered text names the file currently being extracted

---

### Collapsible Panel

#### Test: Collapses and hides its content when toggled closed
**Type:** Unit
**Source:** Feature: Collapsible Chat Panel — criterion 1 (shared component, also used by the folder panel)
**Given:** A collapsible panel rendered in its expanded state
**When:** Its collapse toggle is activated
**Then:**
- [ ] The panel's content is no longer visible/rendered
- [ ] The panel's collapsed affordance (e.g. a re-expand control) remains visible

#### Test: Restores its content when toggled back open
**Type:** Unit
**Source:** Feature: Collapsible Chat Panel — criterion 2
**Given:** A collapsible panel in its collapsed state
**When:** Its expand toggle is activated
**Then:**
- [ ] The panel's content is visible again

---

### Graph Edge Styling (pure util)

#### Test: Maps each relation-type label to a distinct edge style
**Type:** Unit
**Source:** Feature: 3D Graph Rendering & Initial Load — criterion 2
**Given:** A set of edges with different relation-type labels (e.g. `is_a`, `depends_on`, `part_of`, a freeform verb phrase)
**When:** The relation-to-style mapping function is called for each
**Then:**
- [ ] Each relation type resolves to a distinct, defined style/label (no two distinct relation types silently collapse to the same undifferentiated style)
- [ ] An unrecognized/freeform relation label still resolves to a valid fallback style rather than throwing

---

### Node Detail Overlay

#### Test: Renders the concept's description, source files, and linked concepts when given node data
**Type:** Unit
**Source:** Feature: Node Click HUD Detail Overlay — criterion 1
**Given:** Node data including a description, a list of source files, and a list of linked concepts
**When:** The overlay renders for that node
**Then:**
- [ ] The description text is visible
- [ ] Each source file is listed
- [ ] Each linked concept is rendered as a clickable link

#### Test: Dismisses when the dismiss trigger fires
**Type:** Unit
**Source:** Feature: Node Click HUD Detail Overlay — criterion 4
**Given:** The overlay is open for a node
**When:** An outside-click (or re-click on the same node) event fires
**Then:**
- [ ] The overlay is no longer rendered

---

### Trace Block

#### Test: Renders the live-updating visited-concept sequence while traversal is in progress
**Type:** Unit
**Source:** Feature: Live Traversal Trace Block — criterion 1
**Given:** A trace prop with an in-progress, non-collapsed sequence of visited concepts
**When:** The trace block renders
**Then:**
- [ ] Each visited concept in the sequence is rendered in order

#### Test: Renders in a collapsed "show reasoning path" state once given a completed trace
**Type:** Unit
**Source:** Feature: Live Traversal Trace Block — criterion 2
**Given:** A trace prop marked as complete/collapsed
**When:** The trace block renders
**Then:**
- [ ] The block renders a collapsed summary labeled for expansion (e.g. "show reasoning path") instead of the full live sequence

#### Test: Expands to reveal the full visited-concept sequence when toggled open
**Type:** Unit
**Source:** Feature: Live Traversal Trace Block — criterion 3
**Given:** A collapsed trace block
**When:** Its expand control is activated
**Then:**
- [ ] The full visited-concept sequence for that query becomes visible

#### Test: Renders independently for each of multiple past queries in the transcript
**Type:** Unit
**Source:** Feature: Live Traversal Trace Block — criterion 4
**Given:** A transcript with two completed queries, each with their own trace
**When:** Both trace blocks render
**Then:**
- [ ] Expanding one query's trace does not affect the other query's trace expand/collapse state

---

### Answer Message

#### Test: Renders the answer text with normal accent styling beneath the trace summary
**Type:** Unit
**Source:** Feature: Answer Display — criteria 1-2
**Given:** An answer message with text and an associated (collapsed) trace summary
**When:** The chat entry renders
**Then:**
- [ ] The answer text is visible, positioned beneath the trace summary
- [ ] The answer entry carries the normal (non-muted) accent styling class/token

---

### No-Match Message

#### Test: Renders in a muted/neutral style distinct from the normal answer accent color
**Type:** Unit
**Source:** Feature: No-Match Message Display — criterion 1
**Given:** A no-match chat entry
**When:** It renders
**Then:**
- [ ] The entry carries a muted/neutral styling class/token, not the normal-answer accent class/token

#### Test: Renders with no trace block attached
**Type:** Unit
**Source:** Feature: No-Match Message Display — criterion 2
**Given:** A no-match chat entry
**When:** It renders
**Then:**
- [ ] No trace block (collapsed or expanded) is present alongside it

#### Test: Is visually distinguishable from a normal answer at a glance
**Type:** Unit
**Source:** Feature: No-Match Message Display — criterion 3
**Given:** A normal answer entry and a no-match entry rendered together in a transcript
**When:** Their style classes/tokens are compared
**Then:**
- [ ] The two entries resolve to different styling classes/tokens

---

## Integration Tests

### useWebSocket

#### Test: Establishes a connection on load when a folder is already configured and reflects a connected status
**Type:** Integration
**Source:** Feature: WebSocket Client & Connection Lifecycle — criterion 1; Issue 3
**Given:** A folder is already configured in ingestion state, and a mocked WebSocket connects successfully
**When:** The hook mounts
**Then:**
- [ ] A connection attempt is made
- [ ] Connection state updates to "connected"

**Caveat (open item from PRD/issues):** the mocked WebSocket handshake/event contract here is illustrative and pending finalization against backend Issue 14.

#### Test: Reflects a failed status when the initial connection attempt fails
**Type:** Integration
**Source:** Feature: WebSocket Client & Connection Lifecycle — criterion 1
**Given:** A mocked WebSocket that immediately errors on connect
**When:** The hook mounts
**Then:**
- [ ] Connection state updates to "failed" rather than remaining "connecting" indefinitely

#### Test: Updates connection state to disconnected after an unexpected close event
**Type:** Integration
**Source:** Feature: WebSocket Client & Connection Lifecycle — criterion 2
**Given:** An established mocked connection
**When:** A mocked unexpected close event fires
**Then:**
- [ ] Connection state updates to "disconnected"
- [ ] The disconnected state is visibly indicated (not silent)

#### Test: Automatically attempts to reconnect after an unexpected disconnect
**Type:** Integration
**Source:** Feature: WebSocket Client & Connection Lifecycle — criterion 3
**Given:** A mocked connection that disconnects unexpectedly
**When:** Time advances past the reconnect backoff interval
**Then:**
- [ ] A new connection attempt is made without user action

**Caveat (open item from PRD/issues):** pending backend Issue 14 for the final event/error contract shape.

---

### useFolderConfig

#### Test: Submits a valid folder path and clears prior error state
**Type:** Integration
**Source:** Feature: Folder Path Input & Validation — criterion 2; Issue 4
**Given:** A prior inline error is set, and `fetch` is mocked to return a success response for the folder-configuration endpoint
**When:** A valid path is submitted
**Then:**
- [ ] The prior error state is cleared
- [ ] Ingestion state updates to reflect the newly active folder

**Caveat (open item from PRD/issues):** the mocked request/response payload shape is illustrative and provisional, pending backend Issue 15. This test asserts only the fixed behavior (success clears error and updates state), not a specific field-level schema.

#### Test: Surfaces an inline error and does not crash when the backend reports an invalid/unreadable path
**Type:** Integration
**Source:** Feature: Folder Path Input & Validation — criterion 3; Issue 4
**Given:** `fetch` is mocked to return an error response for the folder-configuration endpoint
**When:** An invalid path is submitted
**Then:**
- [ ] An inline error is displayed
- [ ] The component tree remains mounted and interactive (no crash/unmount)

**Caveat:** pending backend Issue 15 for the exact error response shape.

---

### useFolderSwitch

#### Test: Clears the currently displayed graph when a new valid folder path is submitted
**Type:** Integration
**Source:** Feature: Folder Switching & Session Reset — criterion 1; Issue 14
**Given:** A folder is already loaded with a populated graph, and `fetch` is mocked to accept a new folder path
**When:** A new valid folder path is submitted
**Then:**
- [ ] The graph state is cleared (zero nodes/edges) before the new folder's graph loads

#### Test: Clears the chat transcript and starts a fresh session with no carried-over history
**Type:** Integration
**Source:** Feature: Folder Switching & Session Reset — criterion 2; Issue 14
**Given:** An existing chat transcript with prior turns
**When:** A new valid folder path is submitted
**Then:**
- [ ] The chat transcript is emptied
- [ ] No prior turn history is retained in the new session

#### Test: Resets ingestion status to reflect the newly submitted folder
**Type:** Integration
**Source:** Feature: Folder Switching & Session Reset — criterion 3; Issue 14
**Given:** Ingestion status showing progress for the previous folder
**When:** A new valid folder path is submitted
**Then:**
- [ ] Ingestion status resets rather than continuing to show the previous folder's stale status

**Caveat (open item from PRD/issues):** pending backend Issue 15 for the folder-configuration contract's exact shape.

---

### useIngestionStatus

#### Test: Updates the displayed status without a manual refresh as mocked ingestion events arrive
**Type:** Integration
**Source:** Feature: Live Ingestion Status Display — criterion 1; Issue 5
**Given:** A mocked event stream emitting a sequence of ingestion status events
**When:** Each event is emitted
**Then:**
- [ ] The displayed status updates to match each event without a page/component refresh being triggered

#### Test: Reflects both actively-watching/idle state and in-flight extraction progress
**Type:** Integration
**Source:** Feature: Live Ingestion Status Display — criterion 2; Issue 5
**Given:** A mocked event sequence transitioning watching → extracting → idle
**When:** Each event is processed
**Then:**
- [ ] The status reflects each state transition accurately, including the file being extracted mid-sequence

#### Test: Retains ingestion status when the folder panel is collapsed and re-expanded
**Type:** Integration
**Source:** Feature: Live Ingestion Status Display — criterion 3; Issue 5
**Given:** A current ingestion status is displayed
**When:** The folder panel is collapsed and then re-expanded
**Then:**
- [ ] The same status is shown after re-expanding, not a reset/blank state

**Caveat (open item from PRD/issues):** pending backend Issue 14 — both the full event schema and whether ingestion status shares the chat WebSocket channel or a second dedicated channel are undecided; the mocked event stream here is illustrative only.

---

### useGraphData

#### Test: Renders all persisted nodes and edges returned for the active folder on load
**Type:** Integration
**Source:** Feature: 3D Graph Rendering & Initial Load — criterion 1; Issue 6
**Given:** `fetch` is mocked to return a graph payload with several nodes and typed edges for the graph-read endpoint
**When:** The hook loads the graph for the active folder
**Then:**
- [ ] All returned nodes are present in the rendered scene
- [ ] All returned edges are present in the rendered scene

**Caveat (open item from PRD/issues):** the mocked graph-read response shape is illustrative and provisional, pending backend Issue 16 (including how/whether pagination is handled for large graphs).

#### Test: Renders each edge with a visual treatment reflecting its relation-type label
**Type:** Integration
**Source:** Feature: 3D Graph Rendering & Initial Load — criterion 2; Issue 6
**Given:** A mocked graph payload where edges carry different relation-type labels
**When:** The graph renders
**Then:**
- [ ] Each edge's rendered treatment (label/style) corresponds to its relation-type label

#### Test: Renders an empty scene without erroring when the folder has no graph yet
**Type:** Integration
**Source:** Feature: 3D Graph Rendering & Initial Load — criterion 4; Issue 6
**Given:** `fetch` is mocked to return an empty nodes/edges payload
**When:** The hook loads the graph
**Then:**
- [ ] The scene renders with zero nodes/edges
- [ ] No error is thrown and no error UI is shown

---

### useNodeFadeIn

#### Test: Animates a newly-added node fading into the scene when a mocked ingestion event announces it
**Type:** Integration
**Source:** Feature: Live Node Fade-In on Ingestion — criterion 1; Issue 7
**Given:** An already-rendered scene with existing nodes, and a mocked event announcing a new node
**When:** The event is processed
**Then:**
- [ ] The new node appears via a fade/pop-in transition rather than appearing abruptly with no transition

#### Test: Does not re-layout or disturb existing nodes when a new node fades in
**Type:** Integration
**Source:** Feature: Live Node Fade-In on Ingestion — criterion 2; Issue 7
**Given:** An already-rendered scene with existing nodes at known positions
**When:** A new node fade-in event is processed
**Then:**
- [ ] Existing nodes' positions are unchanged immediately after the new node appears

**Caveat (open item from PRD/issues):** pending backend Issue 14 for the event schema signaling new nodes during ingestion.

---

### useChatSession

#### Test: Sends a submitted question over the active WebSocket connection and appends it to the transcript
**Type:** Integration
**Source:** Feature: Chat Query Submission — criterion 1; Issue 9
**Given:** An active mocked WebSocket connection
**When:** A non-empty question is submitted
**Then:**
- [ ] The question is sent over the mocked connection
- [ ] The question appears as a new entry in the visible transcript

#### Test: Disables the chat input while a traversal is already in progress
**Type:** Integration
**Source:** Feature: Chat Query Submission — criterion 2; Issue 9
**Given:** A submitted question with traversal still in progress (no completion event yet)
**When:** The user attempts to submit a second question
**Then:**
- [ ] The input is disabled or the second submission is queued rather than sent immediately, preventing overlapping queries

#### Test: Does not send or append anything when the submitted question is empty
**Type:** Integration
**Source:** Feature: Chat Query Submission — criterion 3; Issue 9
**Given:** An empty input value
**When:** Submission is triggered
**Then:**
- [ ] No message is sent over the connection
- [ ] No new transcript entry is added

---

### useTraversalSync

#### Test: Updates the trace block and highlights the corresponding graph node/edge for each traversal-step event, in order
**Type:** Integration
**Source:** Feature: Live Traversal Highlight & Camera-Follow — criterion 1; Feature: Live Traversal Trace Block — criterion 1; Issue 10
**Given:** A mocked sequence of traversal-step events, each carrying a concept and hop number
**When:** Each event is processed in sequence
**Then:**
- [ ] The trace block's visited-concept sequence grows in the same order as the events
- [ ] The corresponding node/edge in the graph is highlighted in that same order

**Caveat (open item from PRD/issues):** mocked event payload shape (`{ type: "visit_node", concept, hop }`) is illustrative only, pending backend Issue 14's full schema.

#### Test: Pans/zooms the camera toward each newly visited node as steps arrive
**Type:** Integration
**Source:** Feature: Live Traversal Highlight & Camera-Follow — criterion 3; Issue 10
**Given:** A mocked traversal-step event for a node not currently in camera focus
**When:** The event is processed
**Then:**
- [ ] A camera pan/zoom transition toward that node's position is triggered (not an instant jump, not a no-op)

#### Test: Stops highlighting and camera-follow and collapses the trace once the completion event is received
**Type:** Integration
**Source:** Feature: Live Traversal Highlight & Camera-Follow — criterion 4; Feature: Live Traversal Trace Block — criterion 2; Issue 10
**Given:** An in-progress traversal with active highlighting
**When:** A mocked completion event is received
**Then:**
- [ ] No further highlight/camera-follow updates occur after this point
- [ ] The trace block transitions to its collapsed "show reasoning path" state

**Caveat:** pending backend Issue 14 for the completion event's exact shape.

---

### ChatPanelCollapse

#### Test: Hides the chat panel and expands the graph view's available width when collapsed
**Type:** Integration
**Source:** Feature: Collapsible Chat Panel — criterion 1; Issue 13
**Given:** The chat panel is expanded
**When:** It is collapsed
**Then:**
- [ ] The chat panel's content is hidden
- [ ] The graph view's container grows to occupy the freed width

#### Test: Restores the chat panel with its prior transcript and scroll position when re-expanded
**Type:** Integration
**Source:** Feature: Collapsible Chat Panel — criterion 2; Issue 13
**Given:** A chat panel with transcript history and a specific scroll position, then collapsed
**When:** It is re-expanded
**Then:**
- [ ] The same transcript is shown
- [ ] The scroll position is restored to where it was before collapsing

#### Test: Continues updating an in-progress traversal while the chat panel is collapsed
**Type:** Integration
**Source:** Feature: Collapsible Chat Panel — criterion 3; Issue 13
**Given:** A traversal in progress when the chat panel is collapsed
**When:** Traversal-step events continue to arrive while collapsed, then the panel is re-expanded
**Then:**
- [ ] The trace reflects all events that occurred while collapsed, not just those before/after

---

### NodeDetailOverlayInteraction

#### Test: Highlights/selects the linked concept in the graph when its link is clicked inside the overlay
**Type:** Integration
**Source:** Feature: Node Click HUD Detail Overlay — criterion 2; Issue 8
**Given:** An open overlay for a node with at least one linked concept
**When:** A linked-concept link is clicked
**Then:**
- [ ] The corresponding node in the graph becomes highlighted/selected

#### Test: Keeps the overlay anchored near its node without drift as the camera orbits/zooms
**Type:** Integration
**Source:** Feature: Node Click HUD Detail Overlay — criterion 3; Issue 8
**Given:** An open overlay anchored to a node at a known 3D position
**When:** The camera's orbit/zoom state changes (mocked reprojection input)
**Then:**
- [ ] The overlay's computed 2D screen position updates to match the node's reprojected position each time the camera state changes

---

### GlobalStateCrossPanel

#### Test: Updates ingestion, graph, and chat state together when a folder switch is dispatched
**Type:** Integration
**Source:** Feature: Global App State (Graph / Chat / Ingestion Slices) — criterion 1; Issue 14
**Given:** All three panels are rendered and consuming shared Context state
**When:** A folder-switch action is dispatched
**Then:**
- [ ] All three panels reflect the new folder's state (no panel still shows the previous folder's data)

#### Test: Updates both the graph reducer and the chat reducer from a single traversal-step event stream
**Type:** Integration
**Source:** Feature: Global App State (Graph / Chat / Ingestion Slices) — criterion 2; Issue 10
**Given:** A single mocked traversal-step event stream
**When:** An event is processed
**Then:**
- [ ] Both the graph reducer's highlight state and the chat reducer's trace state update from that same event

---

## E2E Tests

#### Test: Full query flow — folder configured, graph populates, traversal highlights with camera-follow, trace collapses, answer appears
**Type:** E2E
**Source:** PRD user stories 1, 5, 7, 8, 12, 13, 14, 15, 16, 17; Issues 4, 5, 6, 7, 9, 10, 11
**Given:** The app is loaded against a real running backend with a valid folder already ingestible
**When:** The user submits the folder path, waits for ingestion to populate the graph, then asks a question
**Then:**
- [ ] The graph visibly populates with nodes as ingestion proceeds
- [ ] Submitting a question triggers visible sequential node/edge highlighting with camera movement
- [ ] The trace block live-updates during traversal and collapses into a "show reasoning path" summary
- [ ] A 4-5 line answer appears beneath the collapsed trace

#### Test: No-match flow — question with no relevant material yields a muted message with no trace
**Type:** E2E
**Source:** PRD user stories 18, 19; Feature: No-Match Message Display; Issue 12
**Given:** The app is loaded against a real running backend with an ingested folder
**When:** The user asks a question with no relevant grounding material
**Then:**
- [ ] A muted/neutral-styled message appears, distinct from a normal answer
- [ ] No trace block is rendered for that message

#### Test: Folder switch flow — switching folders mid-session resets graph and chat
**Type:** E2E
**Source:** PRD user story 4; Feature: Folder Switching & Session Reset; Issue 14
**Given:** The app is loaded with one folder already ingested and a chat history present
**When:** The user submits a different valid folder path
**Then:**
- [ ] The graph view updates to the new folder's concepts (old graph is gone)
- [ ] The chat transcript is cleared and a fresh session begins

#### Test: Responsive tablet flow — layout stacks and remains usable at tablet viewport width
**Type:** E2E
**Source:** PRD user stories 21, 22; Feature: Three-Panel Responsive Layout; Issue 1
**Given:** The app is loaded in a browser viewport resized to tablet width
**When:** The page renders
**Then:**
- [ ] Panels are stacked rather than side-by-side
- [ ] The folder panel, graph view, and chat panel are each still reachable/usable (no overlap, no offscreen content)

---

## Coverage Summary

| Feature (features.md) | Unit | Integration | E2E |
|---|---|---|---|
| Three-Panel Responsive Layout | AppShell (3) | — | Responsive tablet flow |
| Dark Neon/Glow Theme System | ThemeProvider (2) | — | — |
| Global App State | reducers (subset) | GlobalStateCrossPanel (2) | Full query flow (implicit) |
| Folder Path Input & Validation | FolderPathInput (2) | useFolderConfig (2) | Full query flow |
| Folder Switching & Session Reset | reducers (subset) | useFolderSwitch (3) | Folder switch flow |
| Live Ingestion Status Display | FolderStatusLine (3) | useIngestionStatus (3) | Full query flow |
| 3D Graph Rendering & Initial Load | GraphEdgeStyling (1) | useGraphData (3) | Full query flow |
| Live Node Fade-In on Ingestion | — | useNodeFadeIn (2) | Full query flow |
| Node Click HUD Detail Overlay | NodeDetailOverlay (2) | NodeDetailOverlayInteraction (2) | — |
| Live Traversal Highlight & Camera-Follow | — | useTraversalSync (3) | Full query flow |
| Chat Query Submission | — | useChatSession (3) | Full query flow |
| Live Traversal Trace Block | TraceBlock (4) | useTraversalSync (shared) | Full query flow |
| Answer Display | AnswerMessage (1) | — | Full query flow |
| No-Match Message Display | NoMatchMessage (3) | — | No-match flow |
| Collapsible Chat Panel | CollapsiblePanel (2) | ChatPanelCollapse (3) | — |
| WebSocket Client & Connection Lifecycle | — | useWebSocket (4) | Full query flow (implicit) |

**All 16 features have at least one test. All 24 PRD user stories map to at least one integration or E2E test (verified by walkthrough — see mapping in `context.md`).**

**Gaps / caveats (not full coverage, by design):**
- Tests touching the three open backend contracts (WS event schema/Issue 14, folder-config shape/Issue 15, graph-read shape/Issue 16) assert only PRD/issue-fixed behavior against illustrative mocked payloads — they are **not** full contract tests and must be revisited once those backend issues are implemented and the real shapes are known. 11 of the tests above carry this caveat explicitly.
- Node-overlay screen-space reprojection (Node Click HUD Detail Overlay, criterion 3) is tested at the integration level with a mocked camera-state input rather than a real three.js/WebGL render loop — a true rendering-accuracy test would require a browser-based visual/E2E check, which was judged too brittle/expensive for this pass and was not added.
- Exact animation/rendering helper library choice (`react-three-fiber`/`drei` vs. `react-force-graph` alone) is undecided per the PRD's Out of Scope section — fade-in and highlight tests assert observable DOM/state outcomes, not implementation via a specific library.
- Design-token-specific visual regression testing (exact glow colors/intensity) is out of scope per the PRD; ThemeProvider tests assert theme *application*, not pixel-level values.
