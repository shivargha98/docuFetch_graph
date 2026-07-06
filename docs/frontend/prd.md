# docuFetch Graph — Frontend PRD

Date: 2026-07-05
Source: docs/frontend/grill_doc_roadmap.md (grill-me decision log)

## Problem Statement

A person using docuFetch Graph has a backend that ingests their notes/PDFs into a concept graph and can answer questions grounded in that material — but a backend alone is invisible. Without a UI there's no way to point the tool at a folder, no way to see the concept graph it built, and no way to watch *how* an answer was derived (which concepts/edges were actually traversed) versus just receiving a flat text response. The user explicitly wants this to feel futuristic — a live, explorable knowledge graph, not a plain chat box with a sidebar list.

## Solution

A Vite + React single-page app that:
1. Lets the user type an absolute folder path into a folder panel, which the backend validates and begins watching/ingesting.
2. Renders the concept graph as an orbit-able 3D WebGL scene (`react-force-graph`, 3D mode) as the dominant, central visual element, with typed edges and nodes that fade/pop in live as ingestion adds them.
3. Provides a chat panel beside the graph where the user asks questions; while the backend streams traversal-step events over WebSocket, the graph highlights each visited node/edge in sequence with camera-follow, and the chat panel shows a live-updating collapsible trace synced to the same events.
4. Delivers the final 4-5 line answer under the trace once traversal completes, or a visually distinct muted "no relevant document found" message when nothing qualifies.
5. Lets the user click any graph node to open a floating HUD-style overlay showing that concept's description, source files, and linked concepts.
6. Presents all of this in a dark-only, neon/glow themed UI (shadcn/ui primitives, re-themed), responsive down to tablet width with panels stacking below that breakpoint.

## User Stories

1. As a user, I want to type an absolute folder path into the app, so that I can point docuFetch at my notes without a file-picker that can't see real filesystem paths.
2. As a user, I want inline validation feedback if my folder path doesn't exist or isn't readable, so that I know immediately why ingestion didn't start.
3. As a user, I want the folder path field to pre-fill with the backend's default watched folder on first load, so that I don't have to retype a path I already configured via `.env`.
4. As a user, I want to switch to a different folder later, so that I can work with a different vault without restarting the app.
5. As a user, I want a live ingestion status indicator (e.g. "Watching · 3 files queued", "Extracting concepts from notes.md...", "Idle · up to date"), so that I know the backend is actively working and roughly how far along it is.
6. As a user, I want the folder panel to be collapsible, so that it doesn't take up space once ingestion is running and I'm focused on the graph/chat.
7. As a user, I want the concept graph rendered as an interactive, orbit-able 3D scene, so that exploring my own knowledge feels immersive rather than like a flat diagram.
8. As a user, I want new concept nodes to visibly fade/pop into the graph as ingestion discovers them, so that the graph feels alive and I can see progress without checking a status bar.
9. As a user, I want edges between concepts to show their relation type, so that I can tell *how* two ideas are connected, not just that they are.
10. As a user, I want to click a node and see a floating detail card near it (description, source files, linked concepts), so that I can explore the wiki structurally, not just through chat.
11. As a user, I want the detail card to stay visually anchored to its node as I rotate/zoom the 3D scene, so that it doesn't drift away from what it's describing.
12. As a user, I want to ask a question in a chat panel next to the graph, so that querying my material feels connected to seeing it visually.
13. As a user, I want to watch the graph highlight each concept/edge as the backend traverses it in real time, so that I can see exactly how my answer is being derived.
14. As a user, I want the camera to follow the traversal (panning/zooming toward each newly visited node), so that I can follow a multi-hop trace without manually navigating the 3D scene myself.
15. As a user, I want a live-updating compact trace line in the chat panel (e.g. "Visiting: Neural Networks → Backpropagation → Gradient Descent") while traversal runs, so that I have a textual companion to the visual highlight.
16. As a user, I want that trace to collapse into an expandable "show reasoning path" summary once the answer arrives, so that my chat history stays readable rather than cluttered with permanent log lines.
17. As a user, I want the final answer to appear as a short 4-5 line summary under the trace, so that I get a quick digestible response.
18. As a user, I want a clearly different, muted/neutral message style when no relevant document is found, so that I can immediately tell this apart from a real answer without reading closely.
19. As a user, I want the "no relevant document found" message to have no trace block attached, so that I'm not shown a misleading or empty traversal for a query that had nothing to traverse.
20. As a user, I want the chat panel to be collapsible, so that I can dedicate full screen space to the graph when I'm not actively chatting.
21. As a user, I want the whole app to be usable on a tablet-width screen, so that I'm not locked to a full desktop layout.
22. As a user, I want panels to stack (rather than break/overflow) below the tablet breakpoint, so that the layout stays usable on smaller screens.
23. As a user, I want the entire UI to use a consistent dark, neon/glow visual theme with no light-mode toggle, so that the futuristic identity is consistent and I'm not offered a setting that would dilute it.
24. As a user, I want the app connection/ingestion/traversal state to stay consistent and predictable across panels, so that the folder, graph, and chat views never show contradictory information (e.g. chat responding for a folder that's no longer loaded).

## Implementation Decisions

- **Build tooling:** Vite + React. No SSR/routing/multi-page requirements — this is a single local-use SPA talking to the FastAPI backend over REST + WebSocket.
- **Graph rendering:** `react-force-graph` in 3D mode (three.js/WebGL under the hood). Chosen over 2D options (Sigma.js, Cytoscape.js) specifically for the "futuristic" steer — an orbit-able 3D force-directed network supports glow/particle effects and has built-in primitives for highlighting/animating specific nodes and edges, which maps directly onto visualizing live traversal steps.
- **Layout:** Three-panel structure — collapsible folder panel, dominant central 3D graph view, collapsible chat panel. The graph is the visual centerpiece; folder and chat panels can be collapsed independently to give it more room.
- **Folder selection:** A text input for an absolute filesystem path in the folder panel. The frontend sends the path to a backend validation/config endpoint (backend Issue 15) and surfaces an inline error if the path doesn't exist or isn't readable. No directory-tree browser UI — rejected as unnecessary given the frontend and watched folder share the same local machine as the user.
- **Live traversal visualization:** Each WebSocket traversal-step event triggers, on the graph: a highlight/glow color change on the visited node, a pulse/particle animation along the just-traversed edge, and a smooth camera pan/zoom toward the newly visited node. This is a sequential, per-hop reveal (not a batch-at-the-end reveal), matching the "watch the LLM fetch data" requirement.
- **Chat trace UX:** An inline collapsible "trace" block renders above each answer. While traversal is in progress, the trace live-updates with a compact visited-concept sequence. Once the completion event and final answer arrive, the trace collapses into an expandable "show reasoning path" summary beneath which the 4-5 line answer sits.
- **No-match message:** Rendered with a visually distinct muted/neutral style (e.g. muted gray/amber, not the normal answer's accent color) and has no trace block, since traversal was skipped or produced nothing.
- **State management:** React Context + `useReducer`, with one reducer per concern — graph state, chat/traversal state, ingestion/connection status — each wrapped in its own Context provider. No new state library added at this stage; flagged that Zustand is the fallback option if provider nesting or re-render management becomes painful during implementation.
- **Component styling:** shadcn/ui as base primitives (buttons, inputs, collapsibles, panel containers), re-themed with a custom dark neon/glow Tailwind theme (custom colors, glow box-shadows, glassmorphism panel surfaces). shadcn is unstyled by design, giving accessible interaction basics (focus states, keyboard nav) for free while allowing a fully custom visual identity.
- **Node interactivity:** Clicking a node opens a floating HUD-style overlay card anchored near the node in 3D space (not a fixed side panel), showing the concept's LLM-generated description, source file(s)/chunks, and directly linked concepts as clickable links. Implementation must reproject the node's 3D coordinates to 2D screen space every frame to keep the card anchored without drift, especially while the scene is orbiting/zooming (this is called out as a technical watch-item, not a decided algorithm).
- **Ingestion/watcher status:** A live status indicator in the folder panel, fed by the same WebSocket connection used for chat traversal (or a second dedicated channel — not yet decided which). New/updated concept nodes fade/pop into the 3D graph live as ingestion adds them. A polling-based `GET /ingest/status` badge was considered and rejected as less immediate.
- **Responsiveness:** Layout is responsive down to tablet width; panels stack instead of sitting strictly side-by-side below the breakpoint. Touch-friendly 3D graph controls (orbit/zoom) are required at that breakpoint, though exact gesture mapping is not yet decided (see Out of Scope).
- **Theming:** Dark-only. No light theme, no theme toggle — the neon-on-dark glow aesthetic is treated as the app's visual identity, not a configurable preference.
- **Cross-cutting backend dependency:** The frontend's WebSocket client, folder-config form, and graph-load call are all built against contracts that are still open on the backend side:
  - WebSocket traversal-event schema — behavior is fixed (per-step event with concept + hop number, a distinct completion event, then a distinct final-answer/no-match event, in that order) but the full event/payload schema (including error events) is pinned to **backend Issue 14** and not yet finalized.
  - Folder configuration endpoint — behavior is fixed (reflects `WATCH_FOLDER` default on first load; new path tears down and restarts watcher + chat session; invalid path returns an error) but exact endpoint path, HTTP method, and payload shape are pinned to **backend Issue 15** and not yet finalized.
  - Graph read endpoint — behavior is fixed (returns all nodes + typed edges for the active folder; empty-not-error before ingestion) but exact response shape and pagination handling for large graphs are pinned to **backend Issue 16** and not yet finalized.
  - Frontend features/issues referencing these three integration points must treat the exact wire format as an open dependency to reconcile once those backend issues are implemented, not invent a shape now.

## Testing Decisions

- Testing strategy for the frontend is explicitly not part of this PRD — deferred to a future `test-suite-generator-frontend` pass once features/issues exist to test against (per the grill doc's own deferred list).
- General principle to carry forward when that pass happens: tests should exercise externally observable behavior (rendered output, user interactions, WebSocket message handling as observed by the component) rather than internal implementation details (reducer internals, exact re-render counts).
- No prior frontend test code exists in this repo yet (blank slate) — no existing test patterns to follow.

## Out of Scope

- Exact WebSocket event type contract (event names/payload shapes beyond the illustrative examples in this PRD) — depends on backend Issue 14 being implemented; must be reconciled jointly, not invented here.
- Exact folder-configuration and graph-read API request/response shapes — depend on backend Issues 15 and 16 respectively.
- Specific color/design tokens for the neon/glow theme (exact palette values, glow intensity, glassmorphism parameters) — left to an implementation-time design pass (natural fit for the `frontend-design`/`dataviz` skills), not decided by this PRD.
- Specific animation/rendering helper libraries (e.g. whether `react-three-fiber` + `drei` sit underneath or alongside `react-force-graph` for custom particle/bloom effects) — an implementation-time decision.
- Exact touch interaction/gesture mapping for the 3D graph at tablet breakpoints (orbit/zoom/pan specifics) — an implementation-time decision.
- Frontend automated testing strategy — deferred to a future test-suite-generator-frontend pass.
- Light theme / theme toggle — explicitly rejected, not merely deferred.
- Any backend-side behavior (ingestion, extraction, retrieval, traversal logic) — owned entirely by `docs/backend/`.
- Mobile-phone-width layouts — responsiveness is scoped down to tablet width only, not phone width.
- Authentication/multi-user support — this is a single-user personal local tool.

## Further Notes

- This PRD synthesizes directly from `docs/frontend/grill_doc_roadmap.md` (13-decision grill-me log conducted prior to this PM loop) — no additional user interview was conducted, per the prd-generator skill's process for this project.
- The three backend issue references (14, 15, 16) are point-in-time pins against `docs/backend/issues.md` as it exists as of 2026-07-05; if backend issue numbering changes, features/issues built from this PRD should be re-checked against the current backend issues.md rather than assuming these numbers are permanent.
- The user gave an explicit aesthetic steer ("futuristic, especially the graph rendering") that shaped multiple decisions above (3D mode, neon/glow theme, HUD-style overlays, camera-follow) — this steer should be treated as a hard constraint during implementation, not a soft preference to trade away for convenience.
