# docuFetch Graph — Backend Design Roadmap (Grill Session)

Date: 2026-07-05

## Original ask

> An LLM wiki that ingests folders, creates graph-based linkages of concepts within and across files. A web chat UI lets the user point to a folder, see a graph view of concepts, and ask questions in a chat panel alongside the graph — with the app showing in real time how it's actually traversing the graph to fetch data. The final answer is a 4-5 line summary from Claude Haiku. If no relevant document exists, the app says so explicitly. OpenRouter API available for any other model needs.

Order of work: **backend first, then frontend.** This document covers backend only.

## Pre-existing signals found in the repo before grilling

- `.env` / `.env.example` already declare: `WATCH_FOLDER`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `CHROMA_DB_PATH`, `HASH_STORE_PATH`, `ANTHROPIC_MODEL=claude-haiku-4-5`, `OPENROUTER_EMBED_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free`, `OPENROUTER_LLM_MODEL`.
- No backend code exists yet (`backend/` not created). This grill produced the architecture to build against.
- These env vars pre-committed the project to: **Chroma** for vector storage, an **OpenRouter embedding model**, **Claude Haiku** for the final answer, an **OpenRouter LLM** for secondary reasoning, and folder-watching with hash-based change detection.

## Decision log

### 1. Concept extraction
**Decision:** LLM-based extraction. Each chunk/section is sent to an OpenRouter model with a structured prompt asking for concept names, short descriptions, and relations to other concepts in the same chunk.
**Why:** Richer and more semantic than NER/keyword extraction; captures relationships in the same pass instead of a separate linking step.

### 2. Graph storage
**Decision:** `networkx` in-memory graph, persisted to disk as JSON (path likely alongside `HASH_STORE_PATH`/`CHROMA_DB_PATH`).
**Why:** Originally considered Kuzu (embedded graph DB with Cypher) as the stronger technical fit for traversal — but a web search confirmed **Kuzu was archived by its creator, Kùzu Inc., in October 2025** and is no longer actively maintained (community forks like "bighorn" exist, and FalkorDB is the suggested migration target). Given this is a personal, single-user tool, we chose to avoid the dependency risk entirely and went with the boring, mature, zero-risk option: networkx + JSON. No Cypher, but full control over traversal logic in plain Python, which we need anyway for streaming step-by-step events to the frontend.
**Rejected:** Kuzu (unmaintained), FalkorDB (adds a Redis server dependency — more moving parts than needed for local personal use).

### 3. Entity resolution (merging concepts across files)
**Decision:** Tiered pipeline:
1. Normalized string match (lowercase/strip/singularize) — catches exact duplicates for free.
2. Embedding similarity (via the OpenRouter embed model) on remaining candidates — surfaces likely duplicates above a similarity threshold.
3. LLM adjudication — only invoked for the ambiguous middle band that embedding similarity can't confidently resolve either way.
**Why:** Avoids paying LLM costs for the easy cases (exact/near-exact matches) while still catching loose synonyms like "ML" vs "Machine Learning" that string matching alone would miss.

### 4. Chunking strategy
**Decision:** Structure-aware chunking — split on markdown headings/sections so each chunk is a semantically coherent unit. Falls back to paragraph-based splitting for files without heading structure (plain `.txt`, or PDFs without clean heading markup).
**Why:** Produces more meaningful concept extraction per chunk than fixed-size token windows.

### 5. File type support
**Decision:** Markdown, plain text, and PDF.
**Why:** Covers personal notes/wiki use cases (Obsidian-style vaults) plus reference PDFs, without yet taking on docx or broader format support before the core graph idea is validated.
**Note:** PDFs commonly lack clean heading structure — expect the paragraph-splitting fallback to be the common path for PDFs in practice.

### 6. Ingestion trigger / folder watching
**Decision:** Continuous filesystem watcher (`watchdog`) monitoring the active folder. On create/modify/delete events, hash the file and diff against `HASH_STORE_PATH`; only re-run extraction/embedding for files whose hash changed, and remove graph nodes/chunks for deleted files.
**Why:** Matches what `WATCH_FOLDER`/`HASH_STORE_PATH` already implied, and avoids re-running expensive LLM concept extraction on unchanged files.
**Watch item:** Needs debouncing so a file isn't re-ingested mid-save.

### 7. Folder configuration (UI vs .env)
**Decision:** UI-driven. `WATCH_FOLDER` in `.env` only pre-populates a default shown in the UI on first load. The user can point to a different folder from the web UI, which calls a backend endpoint to tear down the current watcher and start a fresh one (with its own hash store / graph state) for the new path.
**Why:** The original pitch explicitly says the UI lets the user point to a folder directory — `.env`-only configuration would have contradicted that.

### 8. Retrieval / traversal mechanism
**Decision:** Hybrid — vector search provides seed nodes, then an LLM-guided iterative traversal decides which neighboring concept to explore next at each hop (rather than blind fixed-depth BFS).
- Query is embedded and matched against Chroma to get top-k seed chunks/concepts.
- From those seeds, the traversal reasoning model decides, hop by hop, which neighboring concept edge is worth following for this question.
- **Traversal reasoning model:** the OpenRouter model configured via `OPENROUTER_LLM_MODEL` (kept separate from Haiku, which is reserved for the final answer).
- **Traversal budget:** max 3 hops **and** max 15 nodes, whichever limit is hit first — bounds both latency (sequential LLM calls) and the amount of context stuffed into the final answer prompt.
**Why:** Vector search alone doesn't produce real traversal (undercuts the core pitch); pure blind BFS doesn't reason about which edges matter. This hybrid is also what gets streamed live to the frontend as discrete, visualizable steps.

### 9. "No relevant document found" handling
**Decision:** Two-stage — a similarity-score cutoff pre-filter fast-fails queries where the top-k Chroma results are all below threshold (skip traversal entirely, return the explicit not-found message). For queries that pass the threshold but are borderline, the final Haiku call also double-checks whether the retrieved context actually answers the question and can still respond with the not-found message.
**Why:** Catches both "obviously nothing relevant" (cheaply, without wasting a traversal + LLM call) and "scores looked okay but content isn't actually relevant" (via the LLM's judgment).

### 10. Real-time traversal transport
**Decision:** WebSocket. Backend pushes discrete traversal-step events (e.g. `{type: "visit_node", concept: "X", hop: 2}`) as they happen during a chat query; frontend renders them live against the graph view.
**Why:** Natural fit for a session-based chat UI; leaves room for bidirectional use later (e.g. user interrupting/steering traversal) even though today's use is server→client push.

### 11. Chat session model
**Decision:** Single ongoing session per loaded folder, with multi-turn memory: a sliding window of the **last 5 Q&A turns** is included as context for both the traversal seed search and the final answer prompt.
**Why:** Supports natural follow-up questions ("what about X", "how does that relate to Y") without unbounded context growth. Not building multiple named/saved chat threads — that's more UI/storage complexity than the core feature needs right now.
**Open item:** Whether this session survives a backend restart (persisted to disk) was not explicitly settled — default assumption is in-memory only unless raised again.

### 12. Concurrency (background watcher vs live queries)
**Decision:** A simple `asyncio.Lock` (or reader-writer lock) guarding access to the networkx graph and Chroma store. Ingestion writes acquire it; queries acquire it briefly to read.
**Why:** For a single-user personal tool with infrequent file changes, brief lock contention is a non-issue — far less implementation complexity than debounced batch ingestion with atomic state swaps.

### 13. Startup behavior
**Decision:** On backend startup, load the last-persisted graph JSON + hash store immediately (so the UI/graph view is usable right away), then kick off a background diff-scan via the watchdog path to catch any changes made while the app was offline.
**Why:** Fast startup, no wasted re-processing of unchanged files versus a full rescan every time.

### 14. Edge / relation types
**Decision:** Typed relations — the LLM concept-extraction step assigns a relation label to each edge (e.g. "is_a", "depends_on", "contrasts_with", "part_of", or a short freeform verb phrase), not just an untyped "related" link.
**Why:** Gives the traversal-reasoning LLM real signal about which edges are worth following for a given question, and makes the graph visualization more meaningful (labeled edges instead of undifferentiated lines).

## Explicitly deferred (not yet decided — surface these before/during implementation)

- Exact API endpoint list and request/response shapes (e.g. `POST /ingest/folder`, `GET /graph`, `WS /chat`).
- WebSocket message schema details (event types beyond the sketch above, error/completion events).
- Chroma collection schema (how chunk embeddings reference graph node IDs / concept IDs).
- Whether chat session state persists across backend restarts.
- Exact embedding-similarity threshold values (entity-resolution merge threshold, no-match cutoff threshold) — will need empirical tuning once there's a real corpus to test against.
- Testing/eval strategy for the backend (not covered in this grill).

## Next steps

1. Turn this roadmap into `docs/backend/prd.md` (prd-generator skill).
2. Break the PRD into `docs/backend/features.md` (prd-to-features skill).
3. Convert features into `docs/backend/issues.md` (issues-creator skill).
4. Generate the backend test suite (test-suite-generator-backend skill).
5. Once backend is underway, run this same grill process for the frontend (`docs/frontend/grill_doc_roadmap.md`).
