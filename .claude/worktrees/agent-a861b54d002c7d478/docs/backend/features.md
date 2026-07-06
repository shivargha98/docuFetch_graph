# Features

_Generated from: docs/backend/prd.md_

## Ingestion

### Feature: Folder Watcher & Incremental Change Detection

Continuously monitors the active watched folder using `watchdog`, hashes each file, and diffs against `HASH_STORE_PATH` so only changed files trigger re-extraction. Debounces rapid-fire events so a file isn't ingested mid-save.

**Acceptance criteria:**
- [ ] Adding a new file to the watched folder triggers extraction for that file only.
- [ ] Re-saving a file with no content change does not trigger re-extraction (hash match).
- [ ] Editing a file triggers re-extraction only for that file's changed chunks/hash entry.
- [ ] Deleting a file removes its corresponding graph nodes/edges and vector entries.
- [ ] Rapid successive writes to the same file (e.g. editor autosave) result in a single debounced ingestion pass, not one per write.

### Feature: File Loading (Markdown / Text / PDF)

Loads and normalizes content from the three supported file types so downstream chunking has a consistent text representation per file.

**Acceptance criteria:**
- [ ] A `.md` file's content is loaded with heading structure preserved for the chunker.
- [ ] A `.txt` file's content is loaded as plain text.
- [ ] A `.pdf` file's content is extracted to text, with heading structure preserved where present in the PDF.
- [ ] An unsupported file extension (e.g. `.docx`) is skipped without crashing the watcher.

### Feature: Structure-Aware Chunking

Splits loaded file content into semantically coherent chunks — by markdown heading/section when structure is present, falling back to paragraph-based splitting otherwise.

**Acceptance criteria:**
- [ ] A markdown file with headings is split into one chunk per heading section.
- [ ] A plain `.txt` file (no heading structure) is split by paragraph boundaries.
- [ ] A PDF without clean heading markup falls back to paragraph splitting.
- [ ] Each produced chunk retains a reference back to its source file (and section, if applicable).

### Feature: Startup Load-Then-Diff-Scan

On backend startup, loads the last-persisted graph and hash store immediately so the app is usable right away, then kicks off a background diff-scan to reconcile any file changes made while the backend was offline.

**Acceptance criteria:**
- [ ] On startup, the previously persisted graph is available via the graph-read path before any rescan completes.
- [ ] A background scan runs after startup and detects files changed/added/deleted while the backend was offline.
- [ ] Files unchanged since last persisted state are not re-processed by the startup scan.
- [ ] If no prior persisted state exists, startup proceeds to a full initial ingestion instead of failing.

## Extraction

### Feature: LLM Concept Extraction

Sends each chunk to an OpenRouter model (`OPENROUTER_LLM_MODEL`) with a structured prompt to extract concept names and short descriptions from that chunk's content.

**Acceptance criteria:**
- [ ] Given a chunk of text, the extraction call returns a list of concept names with short descriptions.
- [ ] Concepts extracted are grounded in the chunk's actual content (no fabricated concepts absent from the text).
- [ ] Extraction failures (e.g. malformed LLM response) are handled without crashing the ingestion pipeline for other files.

### Feature: Typed Relation Extraction

In the same extraction pass, assigns a relation label (e.g. `is_a`, `depends_on`, `contrasts_with`, `part_of`, or a short freeform verb phrase) between concepts co-occurring in a chunk, instead of an untyped "related" link.

**Acceptance criteria:**
- [ ] Each edge produced by extraction carries a non-empty relation label.
- [ ] Relation labels reflect the direction/semantics implied by the source text (e.g. "part_of" not reversed).
- [ ] Concepts extracted from the same chunk with no clear relation stated are not forced into an artificial edge.

## Entity Resolution

### Feature: Tiered Entity Resolution Pipeline

Merges duplicate/synonymous concepts across files using a three-tier pipeline: normalized string match, embedding similarity (via `OPENROUTER_EMBED_MODEL`), and LLM adjudication for the ambiguous middle band.

**Acceptance criteria:**
- [ ] Two concepts with identical normalized names (case/whitespace/pluralization) are merged without an LLM call.
- [ ] Two concepts with high embedding similarity above the merge threshold are merged without an LLM call.
- [ ] Two concepts with similarity in the ambiguous middle band are adjudicated by an LLM call, and the decision (merge or keep separate) is applied to the graph.
- [ ] Merging two concept nodes preserves source-file references from both original nodes on the resulting node.

**Open question (deferred from PRD):** exact embedding-similarity thresholds bounding the "ambiguous middle band" are not fixed — require empirical tuning against a real corpus before this feature can be considered fully calibrated.

## Graph Store

### Feature: Concept Graph Persistence (networkx + JSON)

Maintains the concept graph in memory as a networkx graph and persists it to disk as JSON, surviving restarts.

**Acceptance criteria:**
- [ ] Graph state (nodes + typed edges) can be serialized to a JSON file and reloaded into an equivalent networkx graph.
- [ ] Node data includes at minimum an id, name, description, and source file reference(s).
- [ ] Edge data includes the typed relation label and source/target node ids.
- [ ] Persisting after an ingestion run reflects all adds/merges/deletes made during that run.

### Feature: Graph Update on Ingestion Events

Applies the results of extraction, entity resolution, and file deletion to the live graph — adding new nodes/edges, merging resolved duplicates, and removing nodes tied to deleted files.

**Acceptance criteria:**
- [ ] New concepts from a newly ingested file are added as new nodes with correct edges.
- [ ] Concepts resolved as duplicates are merged into a single node rather than left as separate nodes.
- [ ] Deleting a source file removes only the nodes/edges solely attributable to that file (nodes shared with other files are retained).
- [ ] Graph updates are applied atomically enough that a concurrent read never sees a half-applied update (see Concurrency module).

## Vector Store

### Feature: Chunk Embedding & Chroma Indexing

Embeds each chunk using `OPENROUTER_EMBED_MODEL` and stores it in Chroma (`CHROMA_DB_PATH`) so it can be retrieved by vector similarity during chat queries.

**Acceptance criteria:**
- [ ] Each ingested chunk produces an embedding stored in the Chroma collection.
- [ ] A query embedding can be matched against stored chunk embeddings to return top-k nearest chunks.
- [ ] Deleting a source file removes its corresponding chunk embeddings from Chroma.
- [ ] Re-ingesting an unchanged file does not create duplicate embeddings for the same chunk.

**Open question (deferred from PRD):** the exact Chroma collection schema — specifically how a stored chunk/embedding references the graph node id(s) it produced — is not yet defined and needs to be settled before this feature is fully implementable.

## Retrieval

### Feature: Vector-Seeded Concept Lookup

Embeds an incoming chat query and matches it against Chroma to produce an initial set of seed concepts/chunks for traversal.

**Acceptance criteria:**
- [ ] A chat query returns a ranked top-k list of candidate chunks/concepts from Chroma.
- [ ] Seed results include enough information (concept id/reference) to start graph traversal from them.
- [ ] An empty or very sparse graph (few/no ingested files) returns an empty seed set without erroring.

### Feature: LLM-Guided Bounded Graph Traversal

From the seed concepts, iteratively asks the traversal-reasoning LLM (`OPENROUTER_LLM_MODEL`) which neighboring edge is worth following next, bounded at 3 hops and 15 nodes total (whichever limit is hit first).

**Acceptance criteria:**
- [ ] Traversal starts from vector-search seed nodes, not an arbitrary graph entry point.
- [ ] Traversal never exceeds 3 hops from any seed node.
- [ ] Traversal never visits more than 15 total nodes for a single query.
- [ ] Each traversal decision (which edge to follow next) is driven by an LLM call reasoning over the current node's neighbors, not a fixed/blind rule.
- [ ] The ordered sequence of visited nodes/edges is returned in a form that can be streamed as discrete steps (see WS module).

## No-Match Detection

### Feature: Similarity-Cutoff Pre-Filter

Fast-fails queries where the top-k Chroma results are all below a similarity threshold, skipping traversal entirely and returning the not-found response immediately.

**Acceptance criteria:**
- [ ] A query whose top-k Chroma results all score below the cutoff skips traversal and the Haiku answer call.
- [ ] A query whose top-k results are below cutoff returns the explicit "no relevant document found" message.
- [ ] A query with at least one result above cutoff proceeds to traversal as normal.

**Open question (deferred from PRD):** the exact similarity-score cutoff value is not fixed and requires empirical tuning against a real corpus.

### Feature: LLM Double-Check for Borderline Relevance

For queries that pass the similarity cutoff but are borderline, has the final Haiku call judge whether the retrieved/traversed context actually answers the question, and fall back to the not-found message if not.

**Acceptance criteria:**
- [ ] Given traversed context that does not substantively address the query, the answer call returns the explicit not-found message instead of a fabricated answer.
- [ ] Given traversed context that does address the query, the answer call proceeds to produce the 4-5 line summary.
- [ ] This check runs only after the similarity-cutoff pre-filter has passed (not a replacement for it).

## Chat Session

### Feature: Single Session Per Folder with Sliding-Window Memory

Maintains one ongoing chat session per active watched folder, including the last 5 Q&A turns as context for both retrieval seeding and the final answer prompt.

**Acceptance criteria:**
- [ ] A follow-up question referencing a prior turn (e.g. "what about X") has that prior turn available as context for seeding and answering.
- [ ] The session context never includes more than the last 5 Q&A turns, regardless of how long the conversation runs.
- [ ] Switching the watched folder starts a fresh session (previous folder's turn history is not carried over).

**Open question (deferred from PRD):** whether session state persists across a backend restart is unresolved — current default assumption is in-memory only.

## Answer Generation

### Feature: Claude Haiku Summary Answer

Produces a 4-5 line answer grounded in the traversed graph/vector context using Claude Haiku (`ANTHROPIC_MODEL=claude-haiku-4-5`).

**Acceptance criteria:**
- [ ] Given traversed context relevant to the query, the returned answer is a 4-5 line summary (not a long-form response).
- [ ] The answer content is grounded in the retrieved/traversed context (not free-form model knowledge unrelated to the ingested material).
- [ ] The answer call incorporates the sliding-window session context for follow-up questions.

## API

### Feature: Folder Configuration Endpoint

Exposes an endpoint the UI calls to point the backend at a folder — either accepting the `WATCH_FOLDER` default on first load or switching to a user-specified path, tearing down and restarting the watcher/session accordingly.

**Acceptance criteria:**
- [ ] On first load with no prior selection, the endpoint reflects `WATCH_FOLDER` from `.env` as the default.
- [ ] Submitting a new folder path tears down the current watcher and hash store, and starts fresh ones scoped to the new path.
- [ ] Submitting a new folder path starts a fresh chat session (old session/history not reused).
- [ ] Submitting an invalid/non-existent path returns an error without crashing the running backend.

**Open question (deferred from PRD):** the exact endpoint path, method, and request/response shape are not fixed in the PRD and need to be defined during implementation.

### Feature: Graph Read Endpoint

Exposes an endpoint returning the current graph state (nodes + typed edges) so the frontend graph view can render without waiting for a chat query.

**Acceptance criteria:**
- [ ] Calling the endpoint returns all currently persisted nodes and edges for the active folder's graph.
- [ ] The response includes each edge's relation type label.
- [ ] Calling the endpoint before any ingestion has completed returns an empty (not erroring) graph.

**Open question (deferred from PRD):** exact response shape/pagination behavior for large graphs is not specified and needs definition during implementation.

## WS

### Feature: Traversal-Step Streaming

Streams discrete traversal-step events over a WebSocket connection as they occur during a chat query, so the frontend can animate/highlight the graph view live.

**Acceptance criteria:**
- [ ] A chat query over the WebSocket connection produces a stream of discrete step events, one per node/edge visited during traversal.
- [ ] Each step event identifies at minimum the concept visited and its hop number.
- [ ] A final event signals completion of traversal, distinct from the intermediate visit events.
- [ ] The final 4-5 line answer is delivered as its own event after traversal completes, not interleaved mid-traversal.

**Open question (deferred from PRD):** the full message schema (all event types, including error events) is not fixed in the PRD beyond the illustrative `{type: "visit_node", concept: "X", hop: 2}` sketch, and needs to be defined during implementation.

## Concurrency

### Feature: Ingestion/Query Lock Guarding

Guards graph_store and vector_store access with an `asyncio.Lock` (or reader-writer lock) so background ingestion writes and live chat-query reads don't race or corrupt state.

**Acceptance criteria:**
- [ ] A chat query running while an ingestion write is in progress does not read a partially-updated graph.
- [ ] An ingestion write waits for an in-progress query read to release the lock before mutating shared state (or vice versa, per chosen lock semantics).
- [ ] Lock contention does not deadlock the backend under normal single-user usage (a query and an ingestion event happening close together in time).
