---
name: test-suite-generator-backend
description: Read prd.md, features.md, and issues.md to generate a complete test suite for the backend — a tests.md plan AND pytest stub files organized by test type. Use whenever the user wants to generate tests from their planning docs, says things like "generate test suite", "create tests from the PRD", "write test stubs", "what should we test", or "turn features into tests". Always cross-references all three source docs before generating output.
user-invocable: true
allowed-tools: Read, Write, Glob, Bash
---
## Context

- This is backend test suite generator, all input and output files are in [docs/backend](../../../docs/backend/).
- Cross-reference `prd.md`, `features.md`, and `issues.md` to generate a complete test suite: a `tests.md` test plan and pytest stub files in `backend/tests/`.
- All three sources matter — the PRD captures behavioral intent, features capture acceptance criteria, issues often add edge cases and specificity. The goal is comprehensive coverage without duplication.

## Inputs

If the user passes paths explicitly, use them. Otherwise search `docs/backend/` for:
- `prd.md` — user stories and behavioral intent
- `features.md` — features with acceptance criteria (primary coverage source)
- `issues.md` — issues with acceptance criteria (edge cases and specifics)

## Process

### 1. Read all three sources

Read each document fully. As you read, build a mental map of:
- Every user story from the PRD
- Every acceptance criterion from features.md (grouped by module)
- Every acceptance criterion from issues.md

### 2. Classify each test case

For each piece of testable behavior, assign it a type:

- **Unit** — tests a single function or class in isolation (chunking logic, embedding generation, RRF scoring, relevance checking). No external services, no DB.
- **Integration** — tests multiple modules working together through a real flow (ingest a file → query → get answer). Uses real ChromaDB, real file I/O.
- **API / Contract** — tests FastAPI endpoints via HTTP (request shapes, response schemas, status codes, error responses).

When in doubt: if it touches the network or a real DB, it's integration or API. If it can run with mocked dependencies, it's unit.

### 3. Deduplicate

If a user story, a feature criterion, and an issue criterion all say the same thing, write one test — not three. Prefer the most specific phrasing (usually from issues.md).

### 4. Write tests.md

Save to `docs/backend/tests.md`. Structure it by test type, then by module within each type.

Use this format for every test case:

```
#### Test: [Descriptive name]
**Type:** Unit / Integration / API
**Source:** [e.g., Feature: Folder Ingestion — criterion 2]
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

### [Module Name]

#### Test: [Name]
...

## Integration Tests

#### Test: [Name]
...

## API / Contract Tests

#### Test: [Name]
...
```

### 5. Write pytest stubs

Create stub files in `backend/tests/`, organized by type:

```
backend/tests/
├── conftest.py           ← shared fixtures (ChromaDB client, tmp folder, test docs)
├── unit/
│   ├── test_ingestion.py
│   ├── test_chunking.py
│   └── test_retrieval.py
├── integration/
│   └── test_rag_pipeline.py
└── api/
    └── test_endpoints.py
```

Each stub file starts with a module docstring explaining what it covers. Each test function has a docstring matching the test plan entry and ends with `raise NotImplementedError`.

```python
"""
Unit tests for the ingestion module.
Covers: file scanning, chunking, embedding generation, ChromaDB storage.
"""
import pytest


def test_pdf_chunking_produces_correct_chunk_count(tmp_path):
    """
    Given a PDF with known content,
    when chunked with RecursiveCharacterTextSplitter (512 chars, 64 overlap),
    each chunk should be <= 512 characters and overlap correctly.

    Source: Feature: Document Chunking — criterion 1
    """
    raise NotImplementedError
```

`conftest.py` should stub out the fixtures the tests will need (don't implement them — just define the fixture signatures and docstrings so a developer knows what to fill in).

### 6. Report back

After saving both outputs, tell the user:
- Total test count, broken down by type (N unit, N integration, N API)
- Which modules have the most coverage
- Any user stories or acceptance criteria that had no clear test mapping (flag these as gaps)

## Quality bar

- Every acceptance criterion in features.md should map to at least one test
- Every user story in the PRD should be covered by at least one integration or API test
- No test should be so vague it can't be implemented ("system works correctly" is not a test)
- Stub function names should be descriptive enough that a developer knows exactly what to implement without reading the docstring
