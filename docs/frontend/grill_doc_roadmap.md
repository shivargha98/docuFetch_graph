# docuFetch Graph — Frontend Design Roadmap (Grill Session)

Date: 2026-07-05

## Original ask

> A simple web chat UI that lets the user point to a folder directory. The application creates a graph-based view of the concepts, with a chat module beside the graph view where the user can ask questions — and the application shows in real time how the LLM is actually fetching the data (actual graph traversals). The final answer is a 4-5 line summary using Claude Haiku.

Explicit steer from the user during this grill: **the frontend should look futuristic, especially the graph rendering.** This shaped several downstream decisions (3D WebGL graph, neon/glow dark theme).

## Dependency on backend design

This frontend consumes the backend as designed in `docs/backend/grill_doc_roadmap.md`:
- WebSocket transport pushing discrete traversal-step events (e.g. `{type: "visit_node", concept: "X", hop: 2}`) during a chat query.
- Typed edges (relation labels like "is_a", "depends_on") on the concept graph.
- UI-driven folder selection — the backend exposes an endpoint to set/switch the watched folder, with `.env`'s `WATCH_FOLDER` only as a default pre-fill.
- Single chat session per loaded folder, sliding window of last 5 Q&A turns.
- Explicit "no relevant document found" response path, separate from a normal answer.
- Max 3 hops / 15 node traversal budget per query.

## Decision log

### 1. Build tooling
**Decision:** Vite + React.
**Why:** No SSR/routing/multi-page needs — this is a single local-use SPA talking to the FastAPI backend over REST + WebSocket. Next.js's extra machinery wouldn't be used.

### 2. Graph rendering library
**Decision:** `react-force-graph` in **3D mode** (three.js/WebGL).
**Why:** Directly serves the "futuristic" steer — an orbit-able 3D force-directed network with room for glow/particle effects reads as a sci-fi knowledge graph (vs. flatter 2D options like Sigma.js or Cytoscape.js, which were considered and rejected as harder to make feel as dramatic). Also has built-in primitives for highlighting/animating specific nodes and edges, which maps directly onto visualizing live traversal steps.

### 3. Overall layout
**Decision:** Three-panel layout:
1. Collapsible folder panel (path input + ingestion status) on one side.
2. Dominant 3D graph view in the center.
3. Collapsible chat panel on the other side.
**Why:** Matches the "chat module beside the graph view" spec while keeping the folder/ingestion controls out of the way once ingestion is running, and keeps the 3D graph as the visual centerpiece since it's where the futuristic payoff lives.

### 4. Folder selection mechanism
**Decision:** Text input of an absolute filesystem path in the folder panel; the frontend sends it to a backend endpoint that validates the path exists/is readable and returns an inline error if not.
**Why:** Browsers cannot expose an absolute filesystem path from a file/directory picker (`<input webkitdirectory>` only yields relative file listings) — but since backend and folder both live on the same local machine as the user, typing a path is a normal, low-friction interaction. A backend-driven directory-browser tree UI was considered and rejected as more work than the convenience justifies right now.

### 5. Live traversal visualization (on the graph)
**Decision:** Sequential highlight + camera focus per hop — each `visit_node`/`traverse_edge` WebSocket event lights up that node (glow/color change), animates a pulse/particle along the just-traversed edge, and smoothly pans/zooms the camera toward the newly visited node.
**Why:** Makes traversal feel like a guided journey through the graph — the most legible and impressive delivery of "watch the LLM actually fetch data." A static highlight-only or batch-reveal-at-the-end approach was considered and rejected as less faithful to the "real-time" requirement or less visually compelling.

### 6. Chat panel UX (traversal trace + answer)
**Decision:** Inline collapsible "trace" block rendered above each answer — while traversal runs, a compact live-updating trace (e.g. "Visiting: Neural Networks → Backpropagation → Gradient Descent") appears, then collapses into an expandable "show reasoning path" summary once the final 4-5 line answer arrives underneath.
**Why:** Keeps the chat transcript readable (a multi-hop traversal doesn't clutter it with dozens of permanent log lines) while still surfacing the trace for anyone who wants to inspect it, mirroring what's simultaneously happening on the graph view.

### 7. State management
**Decision:** React Context + `useReducer`, with a reducer per concern (graph state, chat/traversal state, ingestion/connection status), each wrapped in its own Context provider.
**Why:** No new dependency; acceptable to have multiple nested providers across panels given the app's scope. (Zustand was the initially recommended lighter-weight alternative — flagged here in case provider nesting/re-render management becomes a pain point during implementation.)

### 8. Component styling
**Decision:** shadcn/ui as the base component primitives (buttons, inputs, collapsibles, panels), heavily re-themed with a dark neon/glow Tailwind theme (custom colors, glow box-shadows, glassmorphism panel surfaces).
**Why:** shadcn ships unstyled by design, so it gives accessible interaction basics (focus states, keyboard nav) for free while still allowing a fully custom, distinctive sci-fi visual identity rather than fighting a pre-styled library's defaults.

### 9. Node interactivity (outside of active chat traversal)
**Decision:** Clicking a concept node opens a **floating HUD-style overlay card** anchored near the node in 3D space, showing its LLM-generated description, source file(s)/chunks, and directly linked concepts as clickable links.
**Why:** Lets users explore the wiki structurally (not just through chat), matching the "wiki" framing of the product. Keeping it spatially anchored to the node (rather than in a fixed side panel) fits the futuristic HUD feel.
**Watch item:** Floating overlays on a rotating/zooming 3D scene need careful positioning logic (reprojecting 3D node coordinates to 2D screen space on every frame) to avoid drift or occlusion.

### 10. Ingestion/watcher status display
**Decision:** Live status indicator in the folder panel, fed by the same WebSocket connection (or a second dedicated channel) used for chat traversal — e.g. "Watching · 3 files queued", "Extracting concepts from notes.md...", "Idle · up to date." New/updated concept nodes fade/pop into the 3D graph live as ingestion adds them.
**Why:** Reinforces the "living wiki" feel and avoids the staleness of polling-based status; rejected a `GET /ingest/status` polling badge as less immediate and requiring a poll cycle before new nodes would appear.

### 11. Responsiveness / target devices
**Decision:** Responsive down to tablet width — panels stack instead of sitting strictly side-by-side below some breakpoint.
**Why:** User's explicit choice, despite this being a primarily desktop-oriented local tool; requires panel-stacking layout logic and touch-friendly 3D graph controls (orbit/zoom via touch) to be accounted for during implementation.

### 12. Theming
**Decision:** Dark-only. No light theme / no theme toggle.
**Why:** The neon-on-dark, glowing-graph aesthetic is the visual identity of the app; a light mode would require a materially different (likely weaker) treatment of the same glow/particle effects, and this is a single-user personal tool with no need to accommodate multiple preferences.

### 13. "No relevant document found" display
**Decision:** Renders as a visually distinct, muted/neutral message style (e.g. muted gray/amber instead of the normal answer's accent color), with no collapsible trace block attached (since traversal was skipped or came up empty).
**Why:** Makes this outcome immediately scannable as different from a real answer when skimming chat history, rather than relying on the user to read the text closely.

## Explicitly deferred (not yet decided — surface these before/during implementation)

- Exact WebSocket event type contract shared with the backend (event names/payload shapes beyond the illustrative examples above — needs to be finalized jointly with the backend's actual implementation).
- Specific color/design tokens for the neon/glow theme (exact palette values, glow intensity, glassmorphism parameters) — natural fit for the `frontend-design` and `dataviz` skills during implementation.
- Specific animation/rendering helper libraries (e.g. whether `react-three-fiber` + `drei` sit underneath or alongside `react-force-graph` for custom effects like particle-flow and post-processing bloom).
- Exact touch interaction behavior for the 3D graph at tablet breakpoints (orbit/zoom/pan gesture mapping).
- Frontend testing strategy (not covered in this grill — see `test-suite-generator-frontend` skill later).

## Next steps

1. Turn this roadmap into `docs/frontend/prd.md` (prd-generator skill).
2. Break the PRD into `docs/frontend/features.md` (prd-to-features skill).
3. Convert features into `docs/frontend/issues.md` (issues-creator skill).
4. Generate the frontend test suite (test-suite-generator-frontend skill).
5. Reconcile the WebSocket event contract and graph/node data shapes jointly with the backend implementation once both sides are further along.
