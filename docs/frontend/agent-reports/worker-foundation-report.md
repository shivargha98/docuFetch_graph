### Status
COMPLETE

### What I Built

Scaffolded `/workspace/frontend/` with Vite + React 19 + TypeScript (`react-ts` template), then built the three-panel dark neon/glow shell and the global state layer.

**Config**
- `vite.config.ts` (26 lines) — `@vitejs/plugin-react` + `@tailwindcss/vite`, dev proxy (`/api` → `http://localhost:8000`, `/ws` → `ws://localhost:8000` with `ws: true`), Vitest config (jsdom, `tests/setup.ts`, include globs for `tests/unit/**` and `tests/integration/**`). Uses `defineConfig` from `vitest/config` (not plain `vite`) so the `test` key type-checks.
- `index.html` — retitled, added Google Fonts `<link>`s for Space Grotesk / Inter / IBM Plex Mono (network-optional; fallback stacks in CSS mean nothing breaks offline).
- `package.json` — all Round-1-through-later-rounds dependencies installed (see below); scripts unchanged (`dev`, `build` = `tsc -b && vite build`, `lint`, `preview`) plus vitest available via `npx vitest run` (no `test` script existed in the template scaffold's `package.json`; brief's own verification step invokes vitest directly via `npx`, so I left `package.json` scripts as scaffolded rather than adding a redundant `"test"` script not requested by the brief).

**Source (`src/`)**
- `App.tsx` (24 lines) — shell composition: `AppProviders` wrapping a `flex flex-col md:flex-row` container with `FolderPanel`, `GraphView`, `ChatPanel`.
- `index.css` (73 lines) — Tailwind v4 import + `@theme` token block (colors, fonts, glow shadows), `.glass-panel` utility class, dark-only `color-scheme`. Completely replaced the Vite template's default stylesheet, which had a `prefers-color-scheme: dark` branch — removing that was necessary, not optional, since a light/dark branch is exactly the toggle mechanism the brief forbids.
- `components/ui/CollapsiblePanel.tsx` (61 lines) — Radix `Collapsible` wrapper; trigger always rendered (re-expand affordance), content unmounts on collapse.
- `components/folder/FolderPanel.tsx` (18 lines), `components/chat/ChatPanel.tsx` (18 lines) — placeholders using `CollapsiblePanel`.
- `components/graph/GraphView.tsx` (24 lines) — themed empty-state placeholder, not collapsible, always carries `flex-1` + `min-h-[320px]`.
- `state/types.ts` (117 lines), `state/graphReducer.ts` (30 lines), `state/chatReducer.ts` (54 lines), `state/ingestionReducer.ts` (28 lines), `state/providers.tsx` (68 lines).
- `lib/utils.ts` (10 lines) — `cn()` helper (clsx + tailwind-merge), a small addition not explicitly named in the brief's file list but required by the shadcn/ui-style `className` merging pattern the brief asked for; kept to a single 6-line function.

**Tests (`tests/`)**
- `tests/setup.ts` (140 lines) — fully implemented `resetAllMocks`, `mockFetch`, `mockWebSocket`, `resetLocalStorage`; header comment updated to mark backend contracts FINAL.
- `tests/unit/reducers.test.ts` (8 tests), `tests/unit/AppShell.test.tsx` (3 tests), `tests/unit/ThemeProvider.test.tsx` (2 tests), `tests/unit/CollapsiblePanel.test.tsx` (2 tests).
- Created empty `tests/integration/` and `tests/e2e/` directories (no files placed there — later workers own their own stubs) so the vitest include globs and Playwright config later workers add resolve cleanly against an existing path.

**Removed:** the Vite template's default `src/App.css`, `src/assets/` (react.svg, vite.svg, hero.png), and `public/icons.svg` — all were only referenced by the scaffolded `App.tsx` I fully replaced; leaving them would be orphaned dead code from my own change.

**Dependency versions actually installed** (from `package.json` after `npm install`):
- Runtime: `react` 19.2.7, `react-dom` 19.2.7, `react-force-graph-3d` 1.29.1, `three` 0.185.1, `tailwindcss` 4.3.2, `@tailwindcss/vite` 4.3.2, `@radix-ui/react-collapsible` 1.1.15, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.6.0, `lucide-react` 1.23.0.
- Dev: `vitest` 4.1.10, `jsdom` 29.1.1, `@testing-library/react` 16.3.2, `@testing-library/jest-dom` 6.9.1, `@testing-library/user-event` 14.6.1, `@types/three` 0.185.0, `@playwright/test` 1.61.1 (plus template defaults: `vite` 8.1.1/8.1.3, `typescript` ~6.0.2, `@vitejs/plugin-react` 6.0.3, `oxlint` 1.71.0).
- `npm install` completed cleanly both times (0 vulnerabilities).

### Exported State Types + Action Unions (verbatim, `src/state/types.ts`)

```ts
export interface GraphNode {
  id: string;
  name: string;
  description: string;
  source_files: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightedNodeIds: string[];
  highlightedEdgeIds: string[];
  selectedNodeId: string | null;
}

export type GraphAction =
  | { type: "ADD_NODE"; node: GraphNode }
  | { type: "SET_GRAPH"; nodes: GraphNode[]; edges: GraphEdge[] }
  | { type: "RESET_GRAPH" };

export interface UserMessage { kind: "user"; id: string; text: string; }
export interface AnswerMessage { kind: "answer"; id: string; text: string; }
export interface NoMatchMessage { kind: "no_match"; id: string; message: string; }
export type ChatMessage = UserMessage | AnswerMessage | NoMatchMessage;

export interface TraceStep {
  nodeId: string;
  concept: string;
  hop: number;
  viaRelation: string | null;
}

export interface Trace {
  queryId: string;
  steps: TraceStep[];
  collapsed: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  traces: Trace[];
}

export type ChatAction =
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "TRACE_STEP"; queryId: string; step: TraceStep }
  | { type: "TRACE_COMPLETE"; queryId: string }
  | { type: "RESET_SESSION" };

export type IngestionStatus =
  | { state: "idle" }
  | { state: "watching"; queued?: number }
  | { state: "extracting"; file?: string };

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface IngestionState {
  folderPath: string | null;
  status: IngestionStatus;
  connectionStatus: ConnectionStatus;
}

export type IngestionAction =
  | { type: "STATUS_UPDATE"; status: IngestionStatus }
  | { type: "RESET_FOLDER"; folderPath: string };
```

Typed hooks exported from `src/state/providers.tsx`: `useGraphState()`, `useChatState()`, `useIngestionState()` — each returns `{ state, dispatch }` for its slice; all three wrapped by `<AppProviders>` (mounted once, in `App.tsx`).

### Theme Token Summary (`src/index.css`, `@theme` block)

| Token | Tailwind utility | Purpose |
|---|---|---|
| `--color-void` | `bg-void` | Base app background (deep indigo-black, not pure black) |
| `--color-glass` / `--color-glass-border` | `bg-glass`, `border-glass-border` | Glassmorphism panel surface + hairline border (used via `.glass-panel`) |
| `--color-ion` (`#6ee7f9`) | `text-ion`, `bg-ion`, `border-ion` | **Primary neon accent** — answers, active traversal highlights |
| `--color-synapse` (`#b389ff`) | `text-synapse`, etc. | **Secondary neon accent** — edge pulses/traversal gradient partner to ion |
| `--color-muted` (`#7c8699`) | `text-muted` | **Muted/neutral treatment** — reserved for "no relevant document found" messages; deliberately flat/unglowing so its lack of glow is itself the signal |
| `--color-text-primary` / `--color-text-secondary` | `text-text-primary`, `text-text-secondary` | Body text tones |
| `--font-display` (Space Grotesk) | `font-display` | Headings/chrome |
| `--font-body` (Inter) | `font-body` (default body font) | Conversational content |
| `--font-mono` (IBM Plex Mono) | `font-mono` | System/telemetry readouts (status lines, hop counts, node ids) |
| `--shadow-glow-ion`, `--shadow-glow-synapse`, `--shadow-glow-soft` | `shadow-glow-ion`, `shadow-glow-synapse`, `shadow-glow-soft` | Glow box-shadow utilities |

Design rationale (from the mandatory `frontend-design` skill pass): a cyan/violet "synaptic" duotone (not a single acid-green/vermilion accent) as the one signature move, everything else quiet — deliberately chosen to avoid the generic "near-black + single bright accent" AI-design default, while still following the PRD's explicit dark/neon/glow/glassmorphism direction exactly.

`color-scheme: dark` is pinned in `:root`; there is no `dark:` variant system and no `prefers-color-scheme` branch anywhere (the scaffold's default stylesheet had one — removed).

### How AppShell Responsive Tests Assert Stacking

jsdom has no real layout/CSS engine, so `tests/unit/AppShell.test.tsx` asserts on the **Tailwind utility classes that encode** the responsive contract rather than computed pixel geometry:
- The shell container (`graphView.parentElement` in `App.tsx`) is `flex flex-col md:flex-row`. `flex-col` is the unprefixed, mobile-first default — i.e. **stacking is the base state**, active at any width below the `md` (768px) breakpoint, with `md:flex-row` overriding it into a row at/above that breakpoint. Tests assert `shell.className` contains `md:flex-row` (desktop case) and `flex-col` (stacked case) — both are always present simultaneously in the class list; the *test's* job is to confirm both classes exist so the CSS media query can do its job in a real browser.
- `graph-view` always carries `flex-1` (majority-space growth once panels are in a row) and `min-h-[320px]` (usable-size floor, unconditional at every breakpoint).
- `folder-panel` / `chat-panel` carry `md:flex-none` (fixed width once in a row; natural content height when stacked).
- No panel uses `absolute`/`fixed` positioning, so stacked layout relies on normal document flow — asserted by a negative regex match on each panel's `className`.
- **Real breakpoint behavior (actual pixel widths/stacking) is NOT verified by these jsdom unit tests** — that's the Playwright e2e suite's job (`docs/frontend/tests/e2e/responsive-tablet.spec.ts`, not built this round). Later workers: don't refactor the shell's `flex flex-col md:flex-row` / `flex-1` / `md:flex-none` / `min-h-[320px]` class structure without updating `AppShell.test.tsx` in lockstep, since that's the only thing keeping the responsive contract test-observable.
- **Tablet-width breakpoint = Tailwind's `md` (768px).** The PRD/brief name a "tablet-width breakpoint" without pinning an exact pixel value (deferred as an implementation detail); I chose `md` as the single stack/row switch point. This is an assumption — flag it if a later spec pins a different value (e.g. `lg`/1024px).

### Test Results

Ran `cd /workspace/frontend && npx vitest run`:
```
 Test Files  4 passed (4)
      Tests  15 passed (15)
```
- `tests/unit/reducers.test.ts` — 8/8 PASS
- `tests/unit/AppShell.test.tsx` — 3/3 PASS
- `tests/unit/ThemeProvider.test.tsx` — 2/2 PASS
- `tests/unit/CollapsiblePanel.test.tsx` — 2/2 PASS

`npx tsc -b` — PASS, no output (clean).

`npm run build` (`tsc -b && vite build`) — PASS:
```
dist/index.html                   0.80 kB │ gzip:  0.43 kB
dist/assets/index-Do2QxhL5.css   10.89 kB │ gzip:  2.98 kB
dist/assets/index-DYzO7Aw5.js   232.29 kB │ gzip: 73.66 kB
✓ built in 13.57s
```

### What the Orchestrator Should Know

- **Tailwind v4** chosen over v3 (per the brief's "pick whichever you can verify working end-to-end today" gotcha) — uses `@tailwindcss/vite` plugin + CSS-native `@theme` token block in `index.css`, no `tailwind.config.js`/`postcss.config.js` needed. Verified working through build + full test suite.
- `@testing-library/jest-dom` v6.x requires importing `@testing-library/jest-dom/vitest` (not the bare package) for its matchers to attach to Vitest's `expect` — the bare import throws `ReferenceError: expect is not defined` at setup time since v6 assumes Jest's global by default. This is now correctly wired in `tests/setup.ts`; later workers adding test files don't need to do anything extra (setup is global via `vite.config.ts`'s `test.setupFiles`), but if anyone imports jest-dom again elsewhere, use the `/vitest` subpath.
- `vite.config.ts` uses `defineConfig` from `'vitest/config'` (not `'vite'`) so the `test` key type-checks under `tsc -b`. Don't switch this back to plain `vite`'s `defineConfig` or the node-side type-check will fail (though it wouldn't be caught by `tsc -b` today since `vite.config.ts`'s own type-check is scoped by `tsconfig.node.json` — but the `test` property itself would be a type error under strict tooling; kept correct regardless).
- **Assumption:** "tablet-width breakpoint" = Tailwind's `md` (768px) — not pinned by PRD/brief, see AppShell section above.
- Radix `Collapsible.Root`/`Trigger` forward `data-testid` and other standard props straight through to the underlying DOM node — confirmed working, no extra wrapper `div` needed around `CollapsiblePanel` usages in `FolderPanel`/`ChatPanel`.
- `react-force-graph-3d` and `three` install and build cleanly while completely unused this round, as expected (no peer-dep or bundling issues surfaced).
- Package scripts unchanged from the Vite `react-ts` scaffold — there is no `"test": "vitest run"` npm script; the brief's own verification instructions invoke `npx vitest run` directly, so I didn't add one to avoid an un-requested `package.json` change. Flag if the orchestrator wants `npm test` to work as a convenience — that's a one-line addition later workers or the orchestrator can make.
- Deleted `public/icons.svg`, `src/App.css`, `src/assets/*` from the Vite scaffold — all were only used by the template's placeholder `App.tsx`, which I fully replaced; kept `public/favicon.svg` (unrelated, still referenced by `index.html`).

### What the Next Worker Needs

- **All later workers** (`worker-folder-input`, `worker-graph3d`, `worker-realtime-chat`, etc.): import state types/actions from `src/state/types.ts`, dispatch via `useGraphState()` / `useChatState()` / `useIngestionState()` from `src/state/providers.tsx` (each returns `{ state, dispatch }`). Do not create new Context/reducers for these three concerns.
- **worker-folder-input**: `FolderPanel` at `src/components/folder/FolderPanel.tsx` is a placeholder using `CollapsiblePanel`; replace its inner `<p>` placeholder with real folder-path input + `FolderStatusLine`, keep the `data-testid="folder-panel"` and the `CollapsiblePanel` wrapper (passed via `testId` prop, not an extra wrapping `div`).
- **worker-graph3d**: `GraphView` at `src/components/graph/GraphView.tsx` keeps `data-testid="graph-view"` and must keep the `flex-1` + `min-h-[320px]` classes (AppShell tests depend on them) when swapping the placeholder `<p>` for the real `react-force-graph-3d` canvas.
- **worker-realtime-chat**: `ChatPanel` at `src/components/chat/ChatPanel.tsx` — same pattern as `FolderPanel`; `chatReducer`'s `TRACE_STEP`/`TRACE_COMPLETE` actions are ready to wire to WS `visit_node`/`traversal_complete` events (map `visit_node.node_id/concept/hop/via_relation` → `TraceStep.nodeId/concept/hop/viaRelation`).
- `tests/setup.ts`'s `mockWebSocket()` handle exposes `instances: MockWebSocketInstance[]` (each with `.sent`, `.url`, `.readyState`, `.onopen/onmessage/onclose/onerror` settable, `.send()`, `.close()`) — inspect `instances[instances.length - 1].sent` to assert what a hook sent over the socket.
- `mockFetch({ folderConfig, graphRead })` routes on URL substring match (`/api/folder-config`, `/api/graph`) — call it per-test with whichever endpoint(s) that test needs stubbed.

### Blockers

None. All dependency files existed (none were required — this is the Round 1 foundation build, no prior worker output to depend on). All brief-mandated tests pass; typecheck and production build are clean.
