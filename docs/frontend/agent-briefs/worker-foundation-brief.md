# Worker Brief: foundation (Round 1 — Issues 1 + 2 + test infrastructure)

You are building the foundation of the docuFetch Graph **frontend** — a futuristic personal-LLM-wiki UI. You own the entire `/workspace/frontend/` directory this round; no other worker is running. Everything you establish here (theme tokens, state types, test fixtures, file layout) becomes frozen contract for six later workers, so precision matters more than speed.

## MANDATORY FIRST STEP — design skill

The user explicitly demands the UI look **absolutely futuristic**. Before writing ANY UI/styling code, invoke the `frontend-design:frontend-design` skill (via the Skill tool) and apply its guidance to the theme you build. This is a direct user instruction, not optional.

## Scope — Issue 1: Static three-panel shell with dark neon/glow theme

Scaffold the Vite + React + **TypeScript** app in `/workspace/frontend/`: a three-panel layout (folder panel | central graph area | chat panel) with panels stacking below the tablet-width breakpoint, styled with shadcn/ui-style primitives re-themed into a dark neon/glow visual identity. Placeholder content in each panel is fine this round.

Acceptance criteria:
- At desktop width, the three panels render side-by-side with the central graph area taking the majority of horizontal space.
- Below the tablet-width breakpoint, panels stack vertically without clipping or overflow; the graph area stays a usable size at both widths.
- All rendered surfaces use the dark neon/glow theme by default. NO light-theme styles and NO theme toggle anywhere in the tree (dark-only is the app's identity — a test asserts no toggle exists).

Theme direction (from the grill doc): dark neon/glow — custom palette, glow box-shadows, glassmorphism panel surfaces. Exact tokens are yours to decide via the design skill; centralize them (CSS variables / Tailwind theme) so later workers reuse tokens instead of inventing colors. Include at minimum: a primary neon accent (used later for answers + traversal highlights), a muted/neutral treatment (used later for "no relevant document found" messages), glass panel surface tokens, and glow shadow utilities.

## Scope — Issue 2: Global app state layer

React Context + `useReducer`, one reducer per concern, each in its own provider, wired into the shell:
- `graphReducer` — nodes/edges, plus room for later: highlight state (visited node/edge ids during traversal), selected node. Actions the test spec names: `ADD_NODE`, `RESET_GRAPH`. Add `SET_GRAPH` (bulk load) since Round 2 will need it.
- `chatReducer` — transcript of messages, per-query trace. Actions named by tests: `ADD_MESSAGE`, `TRACE_STEP`, `TRACE_COMPLETE`, `RESET_SESSION`. Design message entries to support kinds `user | answer | no_match`, and traces attached per-query with a `collapsed`/complete flag and an ordered visited-concept list.
- `ingestionReducer` — folder path, ingestion status, WS connection status. Actions named by tests: `STATUS_UPDATE`, `RESET_FOLDER`. Status value should model at least `watching` (with optional queued count), `extracting` (with optional file), `idle`, per the FolderStatusLine spec in docs/frontend/tests.md.

Acceptance criteria:
- Each reducer is pure, exported, and unit-testable in isolation.
- A dispatch from one panel is observable in another via Context (no prop drilling).

Type every state slice and action precisely — later workers build against your exported types.

## Backend contracts (finalized — shape your state types to fit these)

- GET `/api/graph` → `{"nodes":[{"id","name","description","source_files"}],"edges":[{"source","target","relation"}]}` (empty arrays before ingestion).
- GET `/api/folder-config` → `{"path"}`; POST `{"path"}` → 200 `{"path","status":"watching"}` / 422 `{"detail"}`.
- WS `/ws/chat`: send `{"query"}`; receive `visit_node {node_id, concept, hop, via_relation}` per step, then `traversal_complete {nodes_visited, hops_used}`, then one of `answer {text}` / `no_match {message}`; errors as `error {message}` without socket close.

You do NOT call any of these this round — but graph node/edge types and trace-step types must match these field names.

## Tech setup requirements

1. Scaffold Vite + React + TypeScript in `/workspace/frontend/` (template `react-ts`).
2. Install **ALL dependencies for the entire build now** (package.json is frozen after this round). Runtime: `react`, `react-dom`, `react-force-graph-3d`, `three`, Tailwind CSS (+ its Vite integration), the primitives you use for shadcn/ui-style components (e.g. `@radix-ui/react-collapsible`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` — your judgment, keep it minimal). Dev: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@types/three` if needed, `@playwright/test`. Verify `npm install` fully succeeds.
3. `vite.config.ts`: dev-server proxy — `/api` → `http://localhost:8000`, `/ws` → `ws://localhost:8000` (with `ws: true`). Also configure vitest here or in `vitest.config.ts`: jsdom environment, setup file `tests/setup.ts`, include pattern covering `tests/unit/**` and `tests/integration/**`.
4. `npm run test` → `vitest run`; keep `npm run build` (tsc + vite build) working.

## File layout to create (ownership boundaries for later workers — create ALL of these)

```
frontend/src/
  App.tsx                      # shell composition: providers + 3 panels
  index.css                    # theme tokens (CSS vars), Tailwind, glow/glass utilities
  components/ui/CollapsiblePanel.tsx   # shared collapsible wrapper (folder + chat panels use it)
  components/folder/FolderPanel.tsx    # placeholder panel (later: worker-folder-input)
  components/graph/GraphView.tsx       # placeholder container w/ styled empty state (later: worker-graph3d)
  components/chat/ChatPanel.tsx        # placeholder panel (later: worker-realtime-chat)
  state/types.ts               # all shared state/action/domain types (GraphNode, GraphEdge, ChatMessage, Trace, IngestionStatus, ConnectionStatus)
  state/graphReducer.ts
  state/chatReducer.ts
  state/ingestionReducer.ts
  state/providers.tsx          # three Context providers + typed hooks (useGraphState, useChatState, useIngestionState)
```
Give panels stable `data-testid`s (`folder-panel`, `graph-view`, `chat-panel`) — the AppShell tests measure their presence and relative width. GraphView placeholder should be a themed empty-scene container (it must remain the dominant central area).

Per project CLAUDE.md: every file gets a top-of-file description comment; every function gets a docstring/JSDoc. Simplicity first — no speculative abstractions.

## Tests you own (copy stub → implement → make pass)

Copy these stubs from `/workspace/docs/frontend/tests/` into `/workspace/frontend/tests/` (same relative paths), then implement them fully (they currently `throw new Error("Not implemented")`). Do NOT copy the other stub files — later workers copy their own.

1. `tests/setup.ts` — implement all four helpers for the whole suite: `resetAllMocks()`, `mockFetch({folderConfig?, graphRead?})` (stub global fetch, route by URL `/api/folder-config` and `/api/graph`), `mockWebSocket()` (install a fake `WebSocket` class on globalThis; return `{emitOpen, emitMessage, emitClose, emitError}` driving the most recently constructed instance; sent messages must be inspectable — expose the instances/sent list on the returned handle or a well-documented export), `resetLocalStorage()`. Update the file's header comment: the backend contracts are now FINAL (shapes above), not provisional.
2. `tests/unit/reducers.test.ts` — 8 cases against your three reducers.
3. `tests/unit/AppShell.test.tsx` — 3 responsive-layout cases (jsdom has no real layout: assert via classes/structure/inline styles and document the approach).
4. `tests/unit/ThemeProvider.test.tsx` — dark theme applied, no light tokens, no theme-toggle control.
5. `tests/unit/CollapsiblePanel.test.tsx` — collapse hides content but keeps re-expand affordance; expand restores content.

Keep each test's asserted behavior faithful to the stub's doc comment; you may adapt mechanics (imports, render helpers) to your real implementation.

## What NOT to build

- No WebSocket client, no fetch calls, no data loading (Round 2).
- No 3D graph rendering — placeholder only (react-force-graph-3d is installed but unused).
- No chat submit logic, no trace UI, no folder input handling, no ingestion polling.
- No routing, no light theme, no settings, nothing speculative.

## Verification (synchronous — do not end your turn "waiting" on a background run)

Run these in the foreground and paste actual output summaries into your report:
1. `cd /workspace/frontend && npx vitest run` — all implemented tests pass.
2. `npx tsc --noEmit` (or the tsc step of the build) — clean.
3. `npm run build` — production build succeeds.

## Report

Write `/workspace/docs/frontend/agent-reports/worker-foundation-report.md` with:
- Files created (paths) and dependency list with versions.
- The exact exported state types + action unions (verbatim TS) — later workers code against these.
- Theme token summary (token names + what each is for, esp. the answer-accent and muted no-match treatments) and where they live.
- How AppShell responsive tests assert stacking (so later workers don't break the mechanism).
- Test/typecheck/build results (actual numbers).
- Any deviations from this brief and why; anything later workers must know (gotchas).

## Gotchas identified during planning

- jsdom cannot do real layout or WebGL — design testable seams now (classes/testids), not `getBoundingClientRect` assertions.
- Tailwind v4 vs v3 + shadcn compatibility: pick whichever you can verify working end-to-end (build + tests) today; note the choice in the report.
- `react-force-graph-3d` may pull peer deps — just ensure install + build stay clean with it unused.
- Do not add a `dark:` variant system — the app is dark-only; bake dark into the base tokens.
