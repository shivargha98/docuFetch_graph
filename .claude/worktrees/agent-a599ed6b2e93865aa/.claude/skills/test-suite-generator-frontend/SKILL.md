---
name: test-suite-generator-frontend
description: Read prd.md, features.md, and issues.md to generate a complete test suite for the frontend — a tests.md plan AND Vitest/React Testing Library/Playwright stub files organized by test type. Use whenever the user wants to generate tests from their frontend planning docs, says things like "generate frontend test suite", "create tests from the frontend PRD", "write component test stubs", "what should we test in the UI", or "turn frontend features into tests". Always cross-references all three source docs before generating output.
user-invocable: true
allowed-tools: Read, Write, Glob, Bash
---
## Context

- This is the frontend test suite generator, all input and output files are in [docs/frontend](../../../docs/frontend/).
- Cross-reference `prd.md`, `features.md`, and `issues.md` to generate a complete test suite: a `tests.md` test plan and test stub files in `frontend/tests/`.
- All three sources matter — the PRD captures behavioral intent, features capture acceptance criteria, issues often add edge cases and specificity. The goal is comprehensive coverage without duplication.
- The frontend's testing stack was decided in `docs/frontend/grill_doc_roadmap.md` (Q14): Vitest + React Testing Library for component and hook tests with the network boundary (`fetch`) mocked, plus Playwright for a small number of true end-to-end tests against the real running backend. Match that stack — don't introduce a different test runner.

## Inputs

If the user passes paths explicitly, use them. Otherwise search `docs/frontend/` for:
- `prd.md` — user stories and behavioral intent
- `features.md` — features with acceptance criteria (primary coverage source)
- `issues.md` — issues with acceptance criteria (edge cases and specifics)

If any of these don't exist yet, tell the user which ones are missing and ask whether to proceed with partial coverage or wait until the PM docs are generated (via the `pm-loop` workflow) — don't silently generate a thin test suite from whatever's available.

## Process

### 1. Read all three sources

Read each document fully. As you read, build a mental map of:
- Every user story from the PRD
- Every acceptance criterion from features.md (grouped by screen/component)
- Every acceptance criterion from issues.md

### 2. Classify each test case

For each piece of testable behavior, assign it a type:

- **Unit** — tests a single component or pure function in isolation (a message bubble rendering citations, the source-stripping regex util, an input validator). No network calls, no browser navigation.
- **Integration** — tests a hook or a small group of components working together through a real interaction (typing a message and pressing Enter calls the chat API and updates the message list; the health-gate hook unlocks the input once `/health` reports ready). Renders with React Testing Library, `fetch` mocked at the network boundary — never mock React internals or component implementation details.
- **E2E** — tests a full user flow in a real browser against the real running FastAPI backend (open the app, wait for ingestion-complete gating to clear, send a question, see an answer with sources appear). Uses Playwright. Reserve this tier for the handful of flows that matter most end-to-end — it's expensive to run and maintain, so don't generate one per acceptance criterion.

When in doubt: if it renders a component and asserts on what appears without touching the network, it's unit. If it needs a mocked `fetch` response or `localStorage` to drive real behavior, it's integration. If it needs the actual backend running, it's E2E.

### 3. Deduplicate

If a user story, a feature criterion, and an issue criterion all say the same thing, write one test — not three. Prefer the most specific phrasing (usually from issues.md).

### 4. Write tests.md

Save to `docs/frontend/tests.md`. Structure it by test type, then by component/hook within each type.

Use this format for every test case:

```
#### Test: [Descriptive name]
**Type:** Unit / Integration / E2E
**Source:** [e.g., Feature: Chat Message Display — criterion 2]
**Given:** [State or setup precondition]
**When:** [The action taken]
**Then:**
- [ ] Expected outcome (observable, verifiable)
- [ ] Expected outcome
```

Full output structure:

```markdown
# Test Suite

_Generated from: prd.md, features.md, issues.md_

## Unit Tests

### [Component/Module Name]

#### Test: [Name]
...

## Integration Tests

### [Hook/Flow Name]

#### Test: [Name]
...

## E2E Tests

#### Test: [Name]
...
```

### 5. Write test stubs

Create stub files in `frontend/tests/`, organized by type:

```
frontend/tests/
├── setup.ts                    ← shared Vitest setup (RTL config, fetch mock helpers, localStorage reset)
├── unit/
│   ├── MessageBubble.test.tsx
│   ├── ChatInput.test.tsx
│   ├── StatusBar.test.tsx
│   └── sources.test.ts
├── integration/
│   ├── useChat.test.tsx
│   ├── useHealthGate.test.tsx
│   └── useIngestStatus.test.tsx
└── e2e/
    └── chat-flow.spec.ts
```

Each stub file starts with a module docstring-style comment explaining what it covers. Each test has a comment matching the test plan entry and ends with a thrown "not implemented" so the suite fails loudly instead of silently passing on an empty body.

**Unit / Integration stub (Vitest + RTL):**

```typescript
/**
 * Unit tests for MessageBubble.
 * Covers: rendering user vs assistant messages, inline citation stripping, source list display.
 */
import { describe, it, expect } from "vitest";

describe("MessageBubble", () => {
  it("strips inline [source: filename] citations and renders them as a separate list below the answer", () => {
    /**
     * Given an assistant message whose text contains inline [source: file.pdf] markers,
     * when the message is rendered,
     * then the citation markers are removed from the displayed answer text and
     * the deduplicated filenames appear in a sources block after the answer.
     *
     * Source: Feature: Chat Message Display — criterion 2 (docs/frontend/grill_doc_roadmap.md Q9)
     */
    throw new Error("Not implemented");
  });
});
```

**E2E stub (Playwright):**

```typescript
/**
 * End-to-end tests for the full chat flow, run against the real running backend.
 * Requires the FastAPI server and a completed ingestion run.
 */
import { test, expect } from "@playwright/test";

test("user can send a message and receive an answer with sources after ingestion completes", async ({ page }) => {
  /**
   * Given the app is loaded and initial ingestion has completed,
   * when the user types a question and presses Enter,
   * then a typing indicator appears, followed by the assistant's answer
   * and a sources block, with the input re-enabled.
   *
   * Source: PRD user story — natural language question via chat UI
   */
  throw new Error("Not implemented");
});
```

`setup.ts` should stub out the shared fixtures/helpers the tests will need (a `mockFetch` helper for stubbing `/chat`, `/health`, `/ingest/status` responses; a `resetLocalStorage` helper) — don't implement them, just define the function signatures and comments so a developer knows what to fill in.

### 6. Report back

After saving both outputs, tell the user:
- Total test count, broken down by type (N unit, N integration, N E2E)
- Which components/hooks have the most coverage
- Any user stories or acceptance criteria that had no clear test mapping (flag these as gaps)

## Quality bar

- Every acceptance criterion in features.md should map to at least one test
- Every user story in the PRD should be covered by at least one integration or E2E test
- No test should be so vague it can't be implemented ("UI works correctly" is not a test)
- E2E coverage should stay small and high-value — if every acceptance criterion is getting an E2E test, push more of them down to integration
- Stub function/test names should be descriptive enough that a developer knows exactly what to implement without reading the comment
