# docuFetch Graph — Backend PRD

Date: 2026-07-05
Source: docs/backend/grill_doc_roadmap.md (grill-me decision log)

## Problem Statement

A person who keeps their notes and reference material in a local folder (Obsidian-style vault, PDFs, plain text) has no easy way to ask questions across that material and see *why* the answer is what it is. Search tools return a flat list of matching files; chat-over-documents tools return an answer but hide how it got there. The user wants to point the app at a folder and get back: a graph of the concepts in their own material, an answer to a question grounded in that material, and a visible trace of which concepts and files were actually consulted to produce it — not a black box, and not silence when nothing relevant exists.

## Solution

A FastAPI backend that:
1. Watches a user-selected folder, incrementally ingesting markdown/text/PDF files as they're added or changed.
2. Extracts concepts and typed relationships between them via an LLM (OpenRouter), building a persistent graph (networkx, JSON on disk) linking concepts within and across files.
3. Embeds chunks into Chroma for vector search.
4. On a chat query, seeds retrieval from vector search, then runs an LLM-guided bounded graph traversal (max 3 hops / 15 nodes) to gather grounded context, streaming each traversal step live over WebSocket.
5. Produces a 4-5 line answer via Claude Haiku, or an explicit "no relevant document found" response when the material doesn't support an answer.
6. Supports natural multi-turn follow-up via a 5-turn sliding-window session per active folder.

## User Stories

1. As a user, I want to point the app at a local folder, so that it starts ingesting my existing notes/PDFs without manual file-by-file setup.
2. As a user, I want to switch to a different folder from the UI, so that I can work with a different vault without editing config files or restarting the backend.
3. As a user, I want the backend to remember which folder I last used, so that on first load it can suggest a sensible default (from `WATCH_FOLDER`).
4. As a user, I want newly added or edited files in my watched folder to be picked up automatically, so that I don't have to manually trigger re-ingestion.
5. As a user, I want unchanged files to be skipped on re-scan, so that I'm not paying LLM extraction costs repeatedly for the same content.
6. As a user, I want deleted files to be removed from the graph and vector store, so that the graph doesn't accumulate stale concepts.
7. As a user, I want markdown, plain text, and PDF files supported, so that I can use both my note vault and reference PDFs.
8. As a user, I want each file chunked in a way that respects its structure (headings/sections), so that extracted concepts are coherent rather than arbitrarily split.
9. As a user, I want the concepts extracted from my documents to be meaningful (names + short descriptions), so that the graph reflects real ideas, not noise keywords.
10. As a user, I want concepts extracted from different files to be recognized as the same concept when they refer to the same thing (including loose synonyms like "ML" vs "Machine Learning"), so that the graph doesn't have needless duplicate nodes.
11. As a user, I want relationships between concepts to be labeled (e.g. "is_a", "depends_on", "part_of"), so that I can understand *how* two ideas relate, not just that they're related.
12. As a user, I want to ask a question in a chat panel, so that I can query my own material conversationally.
13. As a user, I want to see, in real time, which concepts and files the backend is traversing to answer my question, so that I can trust and verify the answer's provenance.
14. As a user, I want the final answer to be short (4-5 lines), so that I get a quick, digestible summary rather than a wall of text.
15. As a user, I want to be told explicitly when no relevant document exists for my question, so that I don't get a hallucinated or misleading answer.
16. As a user, I want to ask follow-up questions that reference earlier turns ("what about X", "how does that relate to Y"), so that I can have a natural back-and-forth without repeating context.
17. As a user, I want the backend to still respond correctly if a file changes while a query is in flight, so that concurrent ingestion and chat don't corrupt or race on the graph/state.
18. As a user, I want the backend to come back up quickly after a restart, showing my previously ingested graph immediately, so that I'm not waiting through a full re-ingestion every time I start the app.
19. As a user, I want any changes made to my folder while the backend was offline to be caught and reconciled after restart, so that the graph doesn't silently drift out of sync with my files.
20. As a developer integrating the frontend, I want a WebSocket channel that streams discrete, typed traversal-step events, so that the graph view can animate/highlight nodes as they're visited.
21. As a developer integrating the frontend, I want an API to fetch the current graph state, so that the graph view can render on load without waiting for a query.
22. As a developer integrating the frontend, I want an API to configure/change the watched folder, so that the UI's folder picker has something to call.
23. As a user, I want my last few turns of conversation to be used only as context (not stored forever/unboundedly), so that the app stays fast and doesn't leak old irrelevant context into new answers.

## Implementation Decisions

### Modules to be built
- **ingestion**: folder watcher (watchdog), hash-based change detection (`HASH_STORE_PATH`), structure-aware chunker (markdown headings, paragraph fallback for txt/PDF), file loaders for md/txt/PDF.
- **extraction**: LLM-based concept + typed-relation extraction per chunk, using `OPENROUTER_LLM_MODEL` via OpenRouter, with a structured prompt/response contract (concept name, description, relations to co-occurring concepts).
- **entity_resolution**: tiered pipeline — (1) normalized string match, (2) embedding similarity via `OPENROUTER_EMBED_MODEL` against Chroma, (3) LLM adjudication for the ambiguous middle band. Produces merge decisions that collapse duplicate concept nodes.
- **graph_store**: networkx graph, node = concept (id, name, description, source file references), edge = typed relation. Persisted to disk as JSON (path convention alongside `CHROMA_DB_PATH`/`HASH_STORE_PATH`). Load-on-startup, diff-scan-after behavior.
- **vector_store**: Chroma collection(s) for chunk embeddings, with a schema linking each chunk/embedding back to the graph node id(s) it produced (exact schema is an open item, see Out of Scope/Further Notes).
- **retrieval**: vector-search seeding (top-k against Chroma) + LLM-guided iterative traversal (reasoning model = `OPENROUTER_LLM_MODEL`, separate from the answer model) bounded at 3 hops and 15 nodes, whichever is hit first.
- **no_match_detection**: similarity-score cutoff pre-filter (fast-fail before traversal) plus a Haiku-side double-check on borderline-but-passing results.
- **chat_session**: single session per active watched folder, 5-turn sliding window (Q&A pairs) used as context for both seed search and the final answer prompt. In-memory by default (persistence across restart is an open item).
- **answer_generation**: Claude Haiku (`ANTHROPIC_MODEL=claude-haiku-4-5`) call producing a 4-5 line summary grounded in the traversed context, or the explicit not-found message.
- **api**: FastAPI app exposing folder configuration, graph read, and chat endpoints (exact endpoint list deferred — see Out of Scope).
- **ws**: WebSocket endpoint streaming traversal-step events during a chat query (exact message schema deferred — see Out of Scope).
- **concurrency**: `asyncio.Lock` (or reader-writer lock) guarding graph_store + vector_store access; ingestion writes acquire it, queries acquire it briefly to read.

### Architectural decisions
- Graph storage is networkx + JSON, not a graph database. Kuzu was evaluated and rejected (archived by its maintainer as of Oct 2025); FalkorDB was rejected (adds a Redis server dependency this single-user tool doesn't need). All traversal logic is plain Python over the in-memory networkx graph.
- Folder selection is UI-driven: `WATCH_FOLDER` in `.env` is only a default shown in the UI on first load. Switching folders via the UI tears down the current watcher/session and starts a fresh one scoped to the new path (its own hash store and graph state).
- Retrieval is hybrid, not pure vector search and not blind BFS: vector search finds seed nodes, then an LLM decides hop-by-hop which edge to follow, bounded by a fixed budget (3 hops / 15 nodes) to bound latency and final-prompt context size.
- Two distinct LLM roles are kept separate: `OPENROUTER_LLM_MODEL` for concept extraction, entity-resolution adjudication, and traversal reasoning; `ANTHROPIC_MODEL` (Claude Haiku) reserved solely for the final user-facing answer.
- Edges are typed relations, not generic "related to" links — this is both a traversal-quality signal (which edges are worth following) and a visualization requirement (labeled edges in the graph view).
- Ingestion is incremental and hash-diffed, not full-rescan-every-time: on startup, the last-persisted graph/hash-store loads immediately for a responsive UI, then a background diff-scan reconciles any offline changes.
- File watching requires debouncing so a file isn't re-ingested mid-save (explicitly flagged as a watch-item in the roadmap, not yet resolved to a specific debounce value).

### Schema/contract notes
- Concept node: id, name, short description, source file/chunk references (exact field list to be finalized during implementation, not fully specified in this PRD).
- Edge: typed relation label (e.g. `is_a`, `depends_on`, `contrasts_with`, `part_of`, or a short freeform verb phrase), source/target concept ids.
- Chroma collection schema (how embeddings reference graph node ids) is explicitly deferred — see Out of Scope.
- WebSocket traversal-step event sketch: `{type: "visit_node", concept: "X", hop: 2}` — this is illustrative only; the full event-type list (including error/completion events) is explicitly deferred — see Out of Scope.

## Testing Decisions

- Testing/eval strategy for the backend was explicitly out of scope for the grill session and is deferred to a dedicated pass (test-suite-generator-backend), not this PRD.
- General principle to carry forward once that pass happens: tests should exercise external behavior at module seams (ingestion → graph_store, retrieval → graph_store/vector_store, api/ws → retrieval+answer_generation) rather than internal implementation details of any single module.
- No prior backend test code exists in this repo (blank slate) — there is no prior art to follow yet.

## Out of Scope

- Exact API endpoint list and request/response shapes (e.g. `POST /ingest/folder`, `GET /graph`, `WS /chat`) — to be defined during feature/issue breakdown or implementation, not in this PRD.
- Full WebSocket message schema (event types beyond the illustrative sketch, error/completion events).
- Exact Chroma collection schema (how chunk embeddings reference graph node/concept ids).
- Whether chat session state persists across backend restarts (default assumption: in-memory only, unless revisited).
- Exact embedding-similarity threshold values for entity-resolution merging and no-match cutoff detection — these require empirical tuning against a real corpus and are not fixed here.
- Backend testing/eval strategy (separate pass).
- File formats beyond markdown, plain text, and PDF (e.g. docx) — not building until the core graph idea is validated.
- Multiple named/saved chat threads — only a single session per active folder is in scope.
- Frontend implementation (React/Tailwind UI, graph visualization rendering) — covered by a separate frontend PRD.

## Further Notes

- This PRD intentionally leaves several implementation-detail decisions open (see Out of Scope) because the grill session explicitly deferred them pending either empirical tuning or closer contact with implementation. The features/issues breakdown that follows this PRD should surface these as concrete open questions attached to the relevant feature/issue, not silently resolve them.
- `.env`/`.env.example` in the repo already commit the project to: `WATCH_FOLDER`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `CHROMA_DB_PATH`, `HASH_STORE_PATH`, `ANTHROPIC_MODEL=claude-haiku-4-5`, `OPENROUTER_EMBED_MODEL`, `OPENROUTER_LLM_MODEL`. Any implementation should read configuration from these rather than introducing new env vars unless a genuine gap is found.
- No backend code exists yet in this repo — this PRD is written against a blank `backend/` slate, per the file structure convention in `.claude/CLAUDE.md` (`backend/ingestion/`, plus other backend modules such as api/retrieval).
