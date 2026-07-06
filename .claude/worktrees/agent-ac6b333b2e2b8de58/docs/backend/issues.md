# Issues

_Generated from: docs/backend/features.md (docs/backend/prd.md for context)_

_Note: this backend repo is a blank slate — no code exists yet. Issue 1 is the foundational tracer bullet nearly everything else depends on._

---

## Issue 1: Ingest a single markdown file into a persisted concept graph

**What to build:**
End-to-end tracer bullet: load one local `.md` file, chunk it by heading/section, send each chunk to the OpenRouter extraction model to get concept names + descriptions + typed relations, and write the result into a networkx graph that persists to disk as JSON. No watcher, no multi-file handling, no vector store yet — just prove the load → chunk → extract → persist path works for one file.

**Acceptance criteria:**
- [ ] Given a single markdown file with headings, the pipeline produces one chunk per heading section.
- [ ] Each chunk sent to the extraction model returns concept names, descriptions, and typed relation labels (e.g. `is_a`, `part_of`) between co-occurring concepts.
- [ ] The resulting graph (nodes = concepts with source-file reference, edges = typed relations) is persisted to a JSON file.
- [ ] Reloading the JSON file reconstructs an equivalent networkx graph (same nodes/edges).
- [ ] A malformed/failed extraction response for one chunk does not crash the run for other chunks.

**Blocked by:** None — can start immediately

---

## Issue 2: Extend file loading to plain text and PDF, with paragraph fallback chunking

**What to build:**
Extend Issue 1's loader to also accept `.txt` and `.pdf` files. Files without heading structure (plain text, or PDFs lacking clean heading markup) fall back to paragraph-based chunking instead of heading-based chunking.

**Acceptance criteria:**
- [ ] A `.txt` file is loaded and chunked by paragraph boundaries.
- [ ] A `.pdf` file with clean headings is chunked by heading/section, same as markdown.
- [ ] A `.pdf` file without clean heading markup falls back to paragraph-based chunking.
- [ ] An unsupported extension (e.g. `.docx`) is skipped without crashing the ingestion run.
- [ ] Each chunk (regardless of source format) still retains a reference back to its source file.

**Blocked by:** Issue 1

---

## Issue 3: Embed ingested chunks into Chroma, linked to their graph node(s)

**What to build:**
For each chunk produced during ingestion (Issue 1/2), generate an embedding via `OPENROUTER_EMBED_MODEL` and store it in a Chroma collection (`CHROMA_DB_PATH`), with enough reference data to trace an embedding back to the graph node(s) it produced.

**Acceptance criteria:**
- [ ] Every ingested chunk produces a stored embedding in the Chroma collection.
- [ ] A test query embedding can be matched against stored embeddings to return top-k nearest chunks.
- [ ] Each stored embedding record can be traced back to the concept/graph node id(s) extracted from that chunk.
- [ ] Deleting a source file's chunks removes their embeddings from Chroma (no orphaned vectors).

**Caveat (open question from PRD):** the exact Chroma collection schema — specifically the field(s) used to link an embedding back to graph node ids — is not fixed by the PRD and must be decided during this issue's implementation, not assumed in advance.

**Blocked by:** Issue 1

---

## Issue 4: Entity resolution — normalized string-match merge tier

**What to build:**
Given two ingested files that mention the same concept under an identical (case/whitespace/pluralization-normalized) name, merge them into a single graph node instead of leaving duplicates.

**Acceptance criteria:**
- [ ] Ingesting two files where the same concept name appears (differing only by case/whitespace/simple pluralization) results in one merged node, not two.
- [ ] The merged node's source-file references include both original files.
- [ ] Concepts with genuinely different normalized names are left as separate nodes (no over-merging).

**Blocked by:** Issue 1

---

## Issue 5: Entity resolution — embedding-similarity tier + LLM adjudication for ambiguous matches

**What to build:**
Extend Issue 4's resolution pipeline: for concepts that don't match by normalized string but have high embedding similarity, merge them automatically; for concepts in an ambiguous middle similarity band, ask the LLM to adjudicate merge-or-keep-separate and apply its decision.

**Acceptance criteria:**
- [ ] Two concepts with embedding similarity above the merge threshold (e.g. "ML" vs "Machine Learning") are merged without an LLM call.
- [ ] Two concepts with similarity in the ambiguous middle band trigger an LLM adjudication call, and the graph reflects that call's decision (merged or kept separate).
- [ ] Two concepts with low similarity are left unmerged without any LLM call being made.
- [ ] Merging via either tier preserves source-file references from both original nodes.

**Caveat (open question from PRD):** the exact similarity thresholds bounding "high" vs. "ambiguous middle band" vs. "low" are not fixed by the PRD and require empirical tuning against a real corpus — implement with placeholder/configurable values, not hardcoded assumptions.

**Blocked by:** Issue 3, Issue 4

---

## Issue 6: Folder watcher with hash-based incremental re-ingestion

**What to build:**
Watch a folder with `watchdog`. On file create/modify, hash the file and diff against `HASH_STORE_PATH`; only run the Issue 1–5 pipeline for files whose hash changed. Debounce rapid successive writes to the same file so it isn't ingested mid-save.

**Acceptance criteria:**
- [ ] Adding a new file to the watched folder triggers the full ingestion pipeline for that file only.
- [ ] Re-saving a file with unchanged content does not trigger re-extraction (hash match against `HASH_STORE_PATH`).
- [ ] Editing a file's content triggers re-extraction for that file.
- [ ] Rapid successive saves to the same file (e.g. editor autosave) result in one debounced ingestion pass, not one per save event.

**Blocked by:** Issue 1, Issue 3

---

## Issue 7: File deletion cleanup

**What to build:**
When a watched file is deleted, remove the graph nodes/edges and Chroma embeddings attributable solely to that file, while preserving any concepts/embeddings shared with other still-present files.

**Acceptance criteria:**
- [ ] Deleting a file removes its chunk embeddings from Chroma.
- [ ] Deleting a file removes graph nodes/edges that existed only because of that file.
- [ ] A concept shared between the deleted file and another still-present file remains in the graph (with the deleted file's reference removed from that node, not the whole node).

**Blocked by:** Issue 6

---

## Issue 8: Startup load-persisted-then-diff-scan

**What to build:**
On backend startup, immediately load the last-persisted graph JSON and hash store (so the graph is usable right away), then run a background diff-scan over the watched folder to catch any file changes made while the backend was offline, reconciling via the same add/re-ingest/delete logic as Issues 6–7.

**Acceptance criteria:**
- [ ] On startup, the previously persisted graph is available immediately, before any background scan completes.
- [ ] Files unchanged since the last persisted hash store are not re-processed by the startup scan.
- [ ] A file added or edited while the backend was offline is detected and ingested by the background scan.
- [ ] A file deleted while the backend was offline is detected and cleaned up (per Issue 7) by the background scan.
- [ ] If no prior persisted state exists (first-ever run), startup proceeds to a full initial ingestion instead of failing.

**Blocked by:** Issue 6, Issue 7

---

## Issue 9: Vector-seeded concept lookup for a query

**What to build:**
Given a chat query string, embed it and match against Chroma to return a ranked top-k list of candidate chunks/concepts to seed graph traversal from.

**Acceptance criteria:**
- [ ] A query string returns a ranked top-k list of chunks/concepts from Chroma.
- [ ] Each returned seed includes enough reference data (concept/graph node id) to begin traversal from it.
- [ ] Querying against a graph with few or no ingested files returns an empty seed set without erroring.

**Blocked by:** Issue 3

---

## Issue 10: LLM-guided bounded graph traversal from seeds

**What to build:**
Starting from Issue 9's seed concepts, iteratively ask the traversal-reasoning LLM (`OPENROUTER_LLM_MODEL`) which neighboring edge is worth following next, bounded to a maximum of 3 hops and 15 total visited nodes (whichever limit is hit first). Return the ordered sequence of visited nodes/edges.

**Acceptance criteria:**
- [ ] Traversal begins only from Issue 9's seed nodes, not an arbitrary graph entry point.
- [ ] No traversal run visits more than 3 hops from any seed node.
- [ ] No traversal run visits more than 15 total nodes.
- [ ] Each hop's next-edge choice is driven by an LLM call reasoning over the current node's neighbors, not a fixed/blind rule (e.g. not plain BFS).
- [ ] The traversal produces an ordered list of visited (node, edge, hop-number) steps, structured so it can later be streamed (Issue 14).

**Blocked by:** Issue 9

---

## Issue 11: Claude Haiku summary answer end-to-end

**What to build:**
Wire together query → Issue 9 seeding → Issue 10 traversal → a Claude Haiku (`ANTHROPIC_MODEL=claude-haiku-4-5`) call that produces a grounded 4-5 line answer from the traversed context. This is the first fully working "ask a question, get an answer" slice.

**Acceptance criteria:**
- [ ] Given a query with relevant ingested material, the pipeline returns a 4-5 line answer grounded in the traversed context.
- [ ] The answer does not include content unrelated to the traversed context (no ungrounded free-form model knowledge).
- [ ] The full path (query → seed → traversal → answer) completes for a single query without manual intervention between steps.

**Blocked by:** Issue 10

---

## Issue 12: No-match detection (similarity cutoff + Haiku double-check)

**What to build:**
Add a two-stage not-found path to Issue 11's flow: a similarity-score cutoff pre-filter that skips traversal entirely when all of Issue 9's top-k results are below threshold, and a Haiku-side double-check for queries that pass the cutoff but whose traversed context turns out not to actually answer the question.

**Acceptance criteria:**
- [ ] A query whose top-k Chroma results are all below the cutoff skips traversal (Issue 10) and the Haiku answer call, returning the explicit "no relevant document found" message.
- [ ] A query that passes the cutoff but whose traversed context doesn't substantively address the question still returns the explicit not-found message (via the Haiku double-check), instead of a fabricated answer.
- [ ] A query with genuinely relevant traversed context proceeds to the normal 4-5 line answer from Issue 11.

**Caveat (open question from PRD):** the exact similarity-score cutoff value is not fixed by the PRD and requires empirical tuning against a real corpus — implement with a configurable value, not a hardcoded guess.

**Blocked by:** Issue 11

---

## Issue 13: Chat session with 5-turn sliding-window memory

**What to build:**
Maintain a single ongoing chat session per active watched folder. Include the last 5 Q&A turns as context for both Issue 9's seeding and Issue 11's answer prompt, so follow-up questions ("what about X") resolve correctly.

**Acceptance criteria:**
- [ ] A follow-up question referencing a prior turn has that prior turn's content available as context for seeding and answering.
- [ ] The session's context never exceeds the last 5 Q&A turns, regardless of conversation length.
- [ ] Switching the watched folder (Issue 15) starts a fresh session — no turn history carried over from the previous folder.

**Caveat (open question from PRD):** whether session state persists across a backend restart is unresolved by the PRD — implement as in-memory only for this issue unless/until that's explicitly revisited.

**Blocked by:** Issue 11

---

## Issue 14: WebSocket traversal-step streaming

**What to build:**
Expose a WebSocket endpoint that, for a chat query, streams Issue 10's ordered traversal steps live as discrete events, followed by a distinct completion event, followed by the final answer (Issue 11/12) as its own event.

**Acceptance criteria:**
- [ ] A chat query submitted over the WebSocket connection produces one streamed event per visited node/edge during traversal (not a single batched dump at the end).
- [ ] Each streamed step event includes at minimum the concept visited and its hop number.
- [ ] A distinct completion event signals traversal has finished, separate from the intermediate visit events.
- [ ] The final answer (or not-found message) is delivered as its own event after the completion event, not interleaved mid-traversal.

**Caveat (open question from PRD):** the full WS message schema (all event types, including error events) is not fully specified by the PRD beyond the illustrative `{type: "visit_node", concept: "X", hop: 2}` sketch — define the complete schema as part of this issue's implementation.

**Blocked by:** Issue 10, Issue 11

---

## Issue 15: Folder configuration API

**What to build:**
Expose an endpoint the UI calls to set or switch the watched folder. On first load it reflects `WATCH_FOLDER` from `.env` as a default; submitting a new path tears down the current watcher/hash-store/graph-session (Issue 6) and starts fresh ones scoped to the new path, including a fresh chat session (Issue 13).

**Acceptance criteria:**
- [ ] On first load with no prior selection, the endpoint reflects `WATCH_FOLDER` as the default folder.
- [ ] Submitting a new valid folder path tears down the current watcher and hash store and starts fresh ones for the new path.
- [ ] Submitting a new folder path resets the chat session (Issue 13) rather than carrying over old turn history.
- [ ] Submitting an invalid or non-existent path returns an error response without crashing the running backend.

**Caveat (open question from PRD):** the exact endpoint path, HTTP method, and request/response payload shape are not fixed by the PRD and must be defined as part of this issue.

**Blocked by:** Issue 6, Issue 13

---

## Issue 16: Graph read API

**What to build:**
Expose an endpoint returning the current graph state (all nodes and typed edges) for the active folder, so the frontend graph view can render on load independent of any chat query.

**Acceptance criteria:**
- [ ] Calling the endpoint returns all currently persisted nodes and edges for the active folder's graph.
- [ ] Each returned edge includes its relation-type label.
- [ ] Calling the endpoint before any ingestion has completed returns an empty graph response, not an error.

**Caveat (open question from PRD):** the exact response payload shape (and whether/how pagination is handled for large graphs) is not specified by the PRD and must be defined as part of this issue.

**Blocked by:** Issue 1

---

## Issue 17: Concurrency guarding between ingestion writes and query reads

**What to build:**
Guard graph_store and vector_store access with an `asyncio.Lock` (or reader-writer lock) so a background ingestion write (Issue 6) and a live chat query read (Issues 9–11) can't race or corrupt shared state.

**Acceptance criteria:**
- [ ] A chat query running concurrently with an in-progress ingestion write never reads a partially-updated graph or vector store.
- [ ] An ingestion write and a query read cannot both mutate/read shared state at the exact same instant (verified by a concurrent-access test scenario).
- [ ] Triggering a file-change ingestion event and a chat query in close succession does not deadlock the backend.

**Blocked by:** Issue 6, Issue 9

---

## Summary of module coverage

| Module | Features | Issues |
|---|---|---|
| Ingestion | Folder Watcher, File Loading, Structure-Aware Chunking, Startup Load-Then-Diff-Scan | 1, 2, 6, 7, 8 |
| Extraction | LLM Concept Extraction, Typed Relation Extraction | 1 |
| Entity Resolution | Tiered Entity Resolution Pipeline | 4, 5 |
| Graph Store | Concept Graph Persistence, Graph Update on Ingestion Events | 1, 4, 5, 7, 8 |
| Vector Store | Chunk Embedding & Chroma Indexing | 3 |
| Retrieval | Vector-Seeded Concept Lookup, LLM-Guided Bounded Graph Traversal | 9, 10 |
| No-Match Detection | Similarity-Cutoff Pre-Filter, LLM Double-Check | 12 |
| Chat Session | Single Session Per Folder with Sliding-Window Memory | 13 |
| Answer Generation | Claude Haiku Summary Answer | 11 |
| API | Folder Configuration Endpoint, Graph Read Endpoint | 15, 16 |
| WS | Traversal-Step Streaming | 14 |
| Concurrency | Ingestion/Query Lock Guarding | 17 |

All 20 features from `features.md` are covered by at least one issue above.
