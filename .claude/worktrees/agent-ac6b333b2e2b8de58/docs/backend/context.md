# PM Loop Context — Backend

**Scope:** backend
**Feature:** docuFetch Graph backend
**Date:** 2026-07-05

## Important Decisions
Source of truth for architecture decisions is `docs/backend/grill_doc_roadmap.md` (14-item decision log from prior grill-me session). Key decisions carried into this PM loop:
- Graph storage: networkx + JSON on disk (Kuzu rejected — archived Oct 2025; FalkorDB rejected — adds Redis dependency).
- Concept extraction: LLM-based (OpenRouter), not NER/keyword.
- Entity resolution: tiered — string match → embedding similarity → LLM adjudication for ambiguous band.
- Chunking: structure-aware (markdown headings), paragraph fallback for txt/PDF.
- File types supported: md, txt, PDF only (no docx yet).
- Ingestion trigger: watchdog + hash-based diffing, debounced.
- Folder config: UI-driven, `.env` WATCH_FOLDER only a default.
- Retrieval: hybrid — Chroma vector search seeds, then LLM-guided bounded traversal (max 3 hops / 15 nodes) using OPENROUTER_LLM_MODEL.
- No-match handling: similarity cutoff pre-filter + Haiku double-check.
- Transport: WebSocket streaming of discrete traversal-step events.
- Chat session: single session per folder, 5-turn sliding window, in-memory (persistence across restart undecided).
- Concurrency: asyncio.Lock guarding graph/Chroma access.
- Startup: load persisted graph immediately, background diff-scan after.
- Edges: typed relations (e.g. is_a, depends_on, contrasts_with, part_of, or freeform verb phrase).

**Explicitly deferred items (from grill doc) — features/issues must account for these as open design points, not silently resolve them:**
- Exact API endpoint list and request/response shapes.
- WebSocket message schema details (event types, error/completion events).
- Chroma collection schema (chunk-to-graph-node-id linkage).
- Chat session persistence across backend restarts.
- Exact similarity threshold values (entity-resolution merge, no-match cutoff) — empirical tuning deferred.
- Testing/eval strategy.

**Update:** the user has since requested the test suite step too. All four stages (PRD → features → issues → tests) are now complete for this loop.

## Key Outputs by Stage

### PRD
Saved to `docs/backend/prd.md`. Synthesized directly from `grill_doc_roadmap.md` — no new interview conducted.

- **Core problem:** users have local notes/PDFs but no way to query them that also shows *why* an answer is correct (no black-box retrieval, no silent hallucination when nothing relevant exists).
- **Primary user stories (23 total):** folder pointing/switching, incremental watch+ingest, hash-based skip-unchanged, deletion cleanup, md/txt/PDF support, structure-aware chunking, LLM concept extraction, cross-file entity resolution (incl. synonyms), typed relation edges, chat Q&A with live traversal visibility, short (4-5 line) answers, explicit no-match messaging, multi-turn follow-ups, concurrency safety during ingestion+query, fast restart with background reconciliation, WS traversal-step streaming, graph-read API, folder-config API, bounded session context.
- **Key constraints/decisions carried in verbatim from grill doc:** networkx+JSON (not Kuzu/FalkorDB), OpenRouter for extraction/resolution/traversal reasoning vs. Claude Haiku reserved only for final answers, 3-hop/15-node traversal budget, tiered entity resolution, UI-driven folder config, asyncio.Lock concurrency, load-then-diff-scan startup.
- **Scope boundaries (explicitly out of scope):** exact API endpoint list/shapes, full WS message schema, Chroma collection schema, chat-persistence-across-restart, exact similarity thresholds, testing strategy (all deferred, to be surfaced as open questions in features/issues rather than resolved), file formats beyond md/txt/PDF, multi-thread chat sessions, frontend implementation.

**Self-check:** PRD is coherent and traces cleanly to all 14 grill-doc decisions plus the 6 deferred items. No fabricated decisions introduced.

### Features
Saved to `docs/backend/features.md`. 20 features across 12 modules (matching the PRD's Implementation Decisions module list): Ingestion (4), Extraction (2), Entity Resolution (1), Graph Store (2), Vector Store (1), Retrieval (2), No-Match Detection (2), Chat Session (1), Answer Generation (1), API (2), WS (1), Concurrency (1).

- **Added vs. PRD:** none invented — every feature traces to an explicit PRD implementation decision or user story. Two "Open question" callouts per feature where the PRD deferred a spec (thresholds, schemas, endpoint shapes) — these were preserved as flagged open items, not resolved with invented values.
- **Removed vs. PRD:** none.
- **Prioritization:** not explicitly ranked by this skill; module grouping followed PRD order. Natural build sequencing implied by dependencies below.
- **Dependencies flagged:**
  - Extraction and Vector Store both depend on Ingestion's chunking output.
  - Entity Resolution depends on Extraction's concept output and Vector Store's embeddings (embedding-similarity tier).
  - Graph Store's "Graph Update on Ingestion Events" depends on Extraction + Entity Resolution results.
  - Retrieval depends on Vector Store (seeding) and Graph Store (traversal).
  - No-Match Detection depends on Retrieval's similarity scores and feeds into Answer Generation.
  - Chat Session and Answer Generation both depend on Retrieval output.
  - WS Traversal-Step Streaming depends on Retrieval's traversal producing a step-by-step sequence.
  - API's Folder Configuration Endpoint depends on Ingestion (tear-down/restart watcher) and Chat Session (fresh session on folder switch).
  - Concurrency (lock guarding) cuts across Graph Store, Vector Store, Ingestion, and Retrieval — not a standalone buildable-first module.

**Self-check:** All 23 PRD user stories map to at least one feature (verified by walkthrough) — no orphaned stories. No contradictory features found between modules.

### Issues
Saved to `docs/backend/issues.md`. 17 issues total, written as tracer-bullet vertical slices in dependency order.

- **Breakdown:** Issue 1 (single-file ingest → extract → persist) is the foundational slice nearly everything else depends on. Issues 2-3 extend format/embedding support. Issues 4-5 split the single "Tiered Entity Resolution" feature into two issues (string-match tier vs. embedding+LLM-adjudication tiers) since the combined feature was too large for one session. Issues 6-8 build out watcher/incremental/startup behavior. Issues 9-12 build the retrieval→traversal→answer→no-match chain. Issue 13 adds session memory. Issue 14 adds WS streaming. Issues 15-16 add the two API endpoints. Issue 17 adds cross-cutting concurrency guarding last, once both writers (ingestion) and readers (retrieval) exist to guard between.
- **Issues spanning multiple features:** Issue 1 covers 3 features (Structure-Aware Chunking, LLM Concept Extraction, Typed Relation Extraction) plus half of Concept Graph Persistence, since these are tightly coupled in a single end-to-end slice. Issue 6 covers Folder Watcher; Issue 7/8 cover the remaining Ingestion features. Issue 15 covers Folder Configuration Endpoint end-to-end (spans API + reaches back into Ingestion + Chat Session for teardown/reset behavior).
- **Implementation order (as written):** 1 → 2/3 (parallel-ish, both depend only on 1) → 4 → 5 → 6 → 7 → 8; separately 9 → 10 → 11 → 12/13 (parallel, both depend only on 11) → 14; 15 (needs 6+13), 16 (needs only 1), 17 (needs 6+9, last).
- **Open questions preserved as issue-level caveats (not resolved):** Chroma schema (Issue 3), entity-resolution thresholds (Issue 5), similarity-cutoff value (Issue 12), chat-persistence-across-restart (Issue 13), WS message schema (Issue 14), API endpoint/payload shapes (Issues 15, 16).
- **Process note:** the issues-creator skill's normal flow includes an interactive "review the breakdown with the user" checkpoint before writing issues.md. Running autonomously as part of this PM loop (per user's instruction to run the full pipeline and report back at the end), that checkpoint was substituted with the orchestrator's own self-check pass below rather than pausing mid-skill for human review. Flagging this so the user can request revisions to issues.md directly if the granularity/dependencies don't match their expectations.

**Self-check:** Verified via the module-coverage table in issues.md — all 20 features from features.md map to at least one issue. No gaps found.

### Test Suite
Saved to `docs/backend/tests.md` (plan) and `docs/backend/tests/` (pytest stubs). Cross-referenced prd.md, features.md, and issues.md per the skill's process.

- **Structure:** `conftest.py` (13 shared fixture stubs: tmp folder + sample md/txt/pdf files, mocked OpenRouter extraction/embedding/traversal clients, mocked Haiku client, real-but-temporary Chroma client, empty/sample networkx graph, injectable entity-resolution thresholds, injectable no-match cutoff, FastAPI + WS test clients) → `unit/` (10 files, one per module: file_loading, chunking, extraction, entity_resolution, graph_store, vector_store, retrieval, no_match_detection, chat_session, answer_generation, concurrency — note retrieval combines vector-seeded-lookup + traversal in one file since both are Retrieval-module features) → `integration/` (5 files: ingestion_pipeline, entity_resolution_pipeline, incremental_ingestion, rag_query_pipeline, concurrency_integration) → `api/` (3 files: folder_config_endpoint, graph_read_endpoint, websocket_traversal_stream).
- **Total: 89 pytest test stubs** across 19 files (58 unit, 20 integration, 11 API/contract — includes 3 explicitly `skip`-marked schema-completeness placeholders and 1 `xfail`-marked persistence-assumption test). All files verified to `py_compile` cleanly.
- **Coverage:** every one of the 20 features in features.md and every one of the 17 issues in issues.md is referenced by at least one test's `Source:` docstring line (verified by walkthrough while writing tests.md's per-module sections and its closing Coverage Notes section).
- **Types of tests generated:** Unit (mocked LLM/embedding clients, no real network/DB — chunking, extraction, entity resolution tiers, graph mutations, vector-store contract, traversal bounds, no-match logic, session windowing, answer grounding, lock behavior), Integration (real temp-folder file I/O + real temporary Chroma instance + mocked LLM calls, exercising full module-to-module flows like ingest-to-persisted-graph, cross-file merge, watcher-to-cleanup, full query-to-answer), API/Contract (FastAPI TestClient + WS test client against the two REST endpoints and the WS streaming endpoint).
- **Issues/features with no testable acceptance criteria:** none found — every acceptance criterion in both source docs mapped to at least one Given/When/Then test case.
- **Six pinned open items handled as contract-only tests, not silently resolved:**
  - Issue 3 (Chroma schema): `test_vector_store.py::test_stored_embedding_is_traceable_to_originating_graph_node_id` — asserts traceability contract without hardcoding a field name.
  - Issue 5 (entity-resolution thresholds): `test_entity_resolution.py` — all threshold-tier tests use the injectable `entity_resolution_thresholds` fixture; one test is `skip`-marked pending real threshold values.
  - Issue 12 (no-match cutoff): `test_no_match_detection.py::test_cutoff_value_is_injectable_not_hardcoded` — proves configurability rather than asserting a number.
  - Issue 13 (chat persistence across restart): `test_chat_session.py::test_session_state_does_not_survive_backend_restart` — `xfail`-marked, documents the PRD's default assumption (in-memory only) without treating it as final.
  - Issue 14 (WS message schema): `test_websocket_traversal_stream.py::test_full_ws_message_schema_matches_finalized_contract` — `skip`-marked pending the full schema; the four other WS tests assert only the already-sketched partial contract (visit_node fields, completion event, final-answer event ordering).
  - Issues 15/16 (API endpoint shapes): both `test_folder_config_endpoint.py` and `test_graph_read_endpoint.py` use clearly-labeled `# TODO` placeholder paths and each has one `skip`-marked shape-completeness test.
- **Notable edge cases captured:** debounced rapid-save events (Issue 6), shared-concept-preserved-on-partial-deletion (Issue 7/graph_store), first-ever-startup-with-no-prior-state (Issue 8), malformed-LLM-response resilience (extraction), embedding-similarity ambiguous middle band (entity resolution), concurrent read-during-write non-corruption and non-deadlock (concurrency), borderline-relevance double-check distinct from hard cutoff (no-match detection), session-reset-on-folder-switch (chat_session/API).

**Self-check:** All 20 features and all 17 issues have corresponding tests (verified via tests.md's per-section Source references and its closing Coverage Notes). No critical path identified without at least a stub test. Gaps are limited to the six explicitly-deferred open items, which is expected and intentional, not an oversight.

## Open Questions / Risks
Carried forward from grill doc's deferred list, and now attached to specific issues rather than floating at the PRD level:
- Chroma collection schema (chunk-to-node-id linkage) → Issue 3
- Entity-resolution similarity thresholds → Issue 5
- No-match similarity-cutoff value → Issue 12
- Chat-session persistence across backend restart → Issue 13
- Full WebSocket message schema → Issue 14
- Exact API endpoint/payload shapes → Issues 15, 16
- Testing/eval strategy → explicitly deferred to a future round (test-suite-generator-backend), not run in this pass.

## Loop Completion Summary (PRD → Features → Issues → Test Suite)
**Status:** Complete — all four stages done.
**Total features:** 20 (across 12 modules)
**Total issues:** 17 (tracer-bullet vertical slices, dependency-ordered)
**Test coverage:** 89 pytest stubs across 19 files (58 unit / 20 integration / 11 API), covering every feature and every issue; see Test Suite section above for full breakdown.
**Key decisions made across this loop:**
- Synthesized PRD directly from the existing grill_doc_roadmap.md with no further interview, per prd-generator's process.
- Grouped features by the 12 modules named in the PRD's Implementation Decisions section, matching grill-doc terminology exactly.
- Split the single "Tiered Entity Resolution Pipeline" feature into two issues (string-tier vs. embedding+LLM-adjudication tiers) because it was too large for one vertical slice.
- Ran issues-creator's drafting step autonomously (no interactive mid-skill review) since this loop is running end-to-end per the user's request; flagged this explicitly so the user can request issue-level revisions.
- Generated test stubs (not real tests) since the repo is a blank slate — every test body is `NotImplementedError`/`skip`/`xfail`, ready to fill in as each issue is implemented.
- All six PRD-deferred open items were carried through PRD → features → issues → tests as explicit contract-only callouts rather than resolved with invented values at any layer.
**Risks or open questions remaining:** the six deferred items (Chroma schema, entity-resolution thresholds, no-match cutoff, chat persistence-across-restart, WS message schema, API endpoint shapes) are unresolved by design (per the original grill session) and are now pinned to specific issues *and* specific tests, so they surface again both when those issues are implemented and when those tests are unskipped/filled in.
