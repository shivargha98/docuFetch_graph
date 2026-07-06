---
name: project-frontend-foundation
description: Key technical decisions baked into the docuFetch Graph frontend foundation (Round 1) that later frontend workers must match, not re-decide.
metadata:
  type: project
---

The frontend foundation (Round 1, worker-foundation, 2026-07-06) at `/workspace/frontend/`
made several decisions later frontend workers should treat as fixed contract rather
than re-litigate:

- **Tailwind v4** via `@tailwindcss/vite`, no `tailwind.config.js`/`postcss.config.js`.
  Theme tokens live as CSS variables in a Tailwind `@theme` block inside
  `src/index.css` (colors, fonts, glow shadows) — add new design tokens there, not
  in a new config file.
- **"Tablet-width breakpoint"** (named but not pixel-pinned in the PRD) was
  implemented as Tailwind's `md` (768px): shell is `flex flex-col md:flex-row`.
  If a later spec/test pins a different pixel value, the shell class + the
  `AppShell.test.tsx` assertions on `md:flex-row`/`flex-col` both need updating
  together.
- **`@testing-library/jest-dom` v6.x must be imported as `@testing-library/jest-dom/vitest`**,
  not the bare package — the bare import assumes Jest's global `expect` and throws
  `ReferenceError: expect is not defined` under Vitest. Already fixed in
  `tests/setup.ts`; don't reintroduce the bare import elsewhere.
- **State architecture**: three Context+useReducer slices (graph/chat/ingestion) in
  `src/state/{types,graphReducer,chatReducer,ingestionReducer,providers}.ts(x)`.
  Typed hooks `useGraphState()`/`useChatState()`/`useIngestionState()` from
  `src/state/providers.tsx` are the only sanctioned way to read/dispatch this
  state — don't create parallel Context for the same concerns.
- **Signature visual motif**: a cyan (`--color-ion` #6ee7f9) / violet
  (`--color-synapse` #b389ff) duotone is the app's one deliberate "signature"
  design choice (chosen via the `frontend-design` skill to avoid the generic
  single-accent-on-near-black AI-design default) — reuse these two tokens for
  anything "live"/traversal-related; muted no-match treatment uses
  `--color-muted` (#7c8699), deliberately flat/unglowing.
- `react-force-graph-3d` + `three` are installed but intentionally unused until
  the graph3d worker's round — this is expected, not a gap.
- No `npm test`/`"test"` script was added to `package.json` (brief's own
  verification used `npx vitest run` directly) — add one if a later round wants
  `npm test` to work.

See the full rationale and file-by-file contract in
`docs/frontend/agent-reports/worker-foundation-report.md`.
