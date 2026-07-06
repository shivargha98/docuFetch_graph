# Backend Build Tracker

_Source of truth for issue status. Updated at every phase transition._

## Legend
Status: `not started` / `in progress` / `done` / `failed` / `blocked`

| Issue | Title | Round | Worker | Status | Started | Completed | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Single-file ingest → extract → persist | 1 | worker-foundation | done | 2026-07-05 | 2026-07-05 | 17/17 assigned tests pass, verified independently. GraphStore.merge_nodes/remove_file added early (see backend_context.md) |
| 2 | Extend loaders to txt/pdf + paragraph fallback | 2 | worker-file-formats | in progress | 2026-07-05 | | agent a5bf645ba5f94e58f |
| 3 | Embed chunks into Chroma | 2 | worker-vector-store | in progress | 2026-07-05 | | agent a599ed6b2e93865aa — resolves Chroma schema open question |
| 16 | Graph read API | 2 | worker-graph-api | in progress | 2026-07-05 | | agent ac6b333b2e2b8de58 — resolves API shape open question |
| 4 | Entity resolution — string tier | 3 | worker-entity-resolution | not started | | | Combined worker with Issue 5 |
| 5 | Entity resolution — embedding + LLM tiers | 3 | worker-entity-resolution | not started | | | Resolves threshold open question |
| 9 | Vector-seeded concept lookup | 3 | worker-retrieval-answer | not started | | | Combined worker with Issues 10, 11 |
| 10 | LLM-guided bounded traversal | 3 | worker-retrieval-answer | not started | | | |
| 11 | Claude Haiku summary answer | 3 | worker-retrieval-answer | not started | | | |
| 6 | Folder watcher + hash diff | 4 | worker-watcher | not started | | | Combined worker with Issues 7, 8 |
| 7 | File deletion cleanup | 4 | worker-watcher | not started | | | |
| 8 | Startup load-then-diff-scan | 4 | worker-watcher | not started | | | |
| 12 | No-match detection | 4 | worker-no-match-chat | not started | | | Combined worker with Issue 13; resolves no-match cutoff |
| 13 | Chat session 5-turn window | 4 | worker-no-match-chat | not started | | | Resolves chat-persistence open question |
| 14 | WS traversal streaming | 5 | worker-ws-streaming | not started | | | Resolves WS schema open question |
| 15 | Folder configuration API | 5 | worker-folder-config | not started | | | Resolves API shape open question |
| 17 | Concurrency lock guarding | 5 | worker-concurrency | not started | | | |
| — | Integration + full test suite | 6 | worker-integration | not started | | | Gate for SHIPPED |

## Round status

- Round 1: done
- Round 2: in progress
- Round 3: not started
- Round 4: not started
- Round 5: not started
- Round 6 (integration): not started

## Log

- 2026-07-05: Planning complete. orchestrator_plan.md and backend_context.md written. Starting Round 1.
- 2026-07-05: Round 1 (Issue 1) complete. worker-foundation built backend/config.py, main.py, clients/, ingestion/{loaders,chunking,pipeline}.py, extraction/extractor.py, graph_store/store.py, requirements.txt. 17/17 assigned tests pass (independently re-verified: `.venv/bin/python3 -m pytest ...` -> 17 passed, 7 errors, all expected NotImplementedError from Issue 2/3 fixtures). Key notes for later rounds: FastAPI app lives at backend/main.py (not backend/api/main.py); GraphStore already has merge_nodes() and remove_file() for Issues 4/5/6/7 to call; GRAPH_STORE_PATH in config.py (default ./graph_store.json). Starting Round 2 (Issues 2, 3, 16 in parallel).
