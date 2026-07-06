# Test Suite

_Generated from: docs/backend/prd.md, docs/backend/features.md, docs/backend/issues.md_

_Repo is a blank slate — no backend implementation exists yet. Every test below is a stub (structure + fixtures defined, body raises `NotImplementedError` or is `xfail`/`skip`-marked) to be filled in as each issue is implemented. Stub files live under `docs/backend/tests/`._

_Six items are explicitly unresolved per the grill session and pinned to specific issues in issues.md (Chroma schema → Issue 3, entity-resolution thresholds → Issue 5, no-match cutoff → Issue 12, chat persistence-across-restart → Issue 13, WS message schema → Issue 14, API endpoint shapes → Issues 15/16). Tests touching these assert the **behavioral contract** using injectable/placeholder values rather than hardcoding a specific number, field name, or path — flagged inline with `# OPEN QUESTION` comments and cross-referenced below._

---

## Unit Tests

### Ingestion — File Loading

#### Test: Markdown file preserves heading structure on load
**Type:** Unit
**Source:** Feature: File Loading — criterion 1
**Given:** a `.md` file with multiple heading levels
**When:** the file is loaded
**Then:**
- [ ] the loaded representation retains heading boundaries for the chunker to use

#### Test: Plain text file loads as unstructured text
**Type:** Unit
**Source:** Feature: File Loading — criterion 2
**Given:** a `.txt` file with paragraphs but no heading markup
**When:** the file is loaded
**Then:**
- [ ] the loaded representation has no heading structure (plain text passthrough)

#### Test: PDF with clean headings preserves heading structure
**Type:** Unit
**Source:** Feature: File Loading — criterion 3
**Given:** a PDF with clean heading markup
**When:** the file is loaded
**Then:**
- [ ] the loaded representation retains heading boundaries, same as markdown

#### Test: PDF without heading markup loads as flat text
**Type:** Unit
**Source:** Feature: File Loading — criterion 3 (fallback case); Issue 2 — criterion 2
**Given:** a PDF with no discernible heading structure
**When:** the file is loaded
**Then:**
- [ ] the loaded representation has no heading structure, ready for paragraph-fallback chunking

#### Test: Unsupported file extension is skipped without crashing
**Type:** Unit
**Source:** Feature: File Loading — criterion 4; Issue 2 — criterion 4
**Given:** a file with an unsupported extension (e.g. `.docx`)
**When:** the loader processes the watched folder
**Then:**
- [ ] the file is skipped
- [ ] no exception propagates out of the loader

---

### Ingestion — Chunking

#### Test: Markdown with headings produces one chunk per heading section
**Type:** Unit
**Source:** Feature: Structure-Aware Chunking — criterion 1; Issue 1 — criterion 1
**Given:** a loaded markdown document with N heading sections
**When:** the document is chunked
**Then:**
- [ ] exactly N chunks are produced, one per heading section

#### Test: Plain text without headings falls back to paragraph splitting
**Type:** Unit
**Source:** Feature: Structure-Aware Chunking — criterion 2; Issue 2 — criterion 1
**Given:** a loaded `.txt` document with no heading structure
**When:** the document is chunked
**Then:**
- [ ] chunks align with paragraph boundaries, not arbitrary character windows

#### Test: PDF without heading structure falls back to paragraph splitting
**Type:** Unit
**Source:** Feature: Structure-Aware Chunking — criterion 3; Issue 2 — criterion 3
**Given:** a loaded PDF with no heading structure
**When:** the document is chunked
**Then:**
- [ ] chunks align with paragraph boundaries, same fallback behavior as plain text

#### Test: Every chunk retains a source file reference
**Type:** Unit
**Source:** Feature: Structure-Aware Chunking — criterion 4
**Given:** any loaded and chunked document (any supported format)
**When:** chunks are produced
**Then:**
- [ ] each chunk carries a reference back to its source file (and section, if applicable)

---

### Extraction

#### Test: Concept extraction returns names and descriptions for a chunk
**Type:** Unit
**Source:** Feature: LLM Concept Extraction — criterion 1; Issue 1 — criterion 2
**Given:** a single chunk of text and a mocked OpenRouter extraction response
**When:** concept extraction is run on the chunk
**Then:**
- [ ] the result is a list of concepts, each with a non-empty name and description

#### Test: Extraction does not fabricate concepts absent from the chunk
**Type:** Unit
**Source:** Feature: LLM Concept Extraction — criterion 2
**Given:** a chunk with known, narrow content and a mocked extraction response
**When:** concept extraction is run
**Then:**
- [ ] returned concepts are traceable to terms/ideas actually present in the chunk (mock is constructed so any hallucinated concept is detectable)

#### Test: Malformed extraction response does not crash the pipeline
**Type:** Unit
**Source:** Feature: LLM Concept Extraction — criterion 3; Issue 1 — criterion 5
**Given:** a chunk and a mocked extraction call that returns malformed/unparseable output
**When:** concept extraction is run
**Then:**
- [ ] the error is caught and handled (e.g. skipped/logged) without raising out of the ingestion run
- [ ] other chunks in the same run are unaffected

#### Test: Extracted edges carry a non-empty typed relation label
**Type:** Unit
**Source:** Feature: Typed Relation Extraction — criterion 1; Issue 1 — criterion 2
**Given:** a chunk containing two related concepts and a mocked extraction response
**When:** extraction runs
**Then:**
- [ ] the edge between the two concepts has a non-empty relation label (e.g. `is_a`, `part_of`, or a freeform verb phrase)

#### Test: Relation label direction matches the source text's semantics
**Type:** Unit
**Source:** Feature: Typed Relation Extraction — criterion 2
**Given:** a chunk stating a directional relation (e.g. "X is part of Y") and a mocked extraction response
**When:** extraction runs
**Then:**
- [ ] the produced edge direction (source → target) matches the stated relation, not reversed

#### Test: No forced edge is created when no relation is stated
**Type:** Unit
**Source:** Feature: Typed Relation Extraction — criterion 3
**Given:** a chunk containing two unrelated concepts with no stated relation
**When:** extraction runs
**Then:**
- [ ] no edge is created between the two concepts

---

### Entity Resolution

#### Test: Identical normalized names merge without an LLM call
**Type:** Unit
**Source:** Feature: Tiered Entity Resolution Pipeline — criterion 1; Issue 4 — criterion 1
**Given:** two concept nodes whose names differ only by case/whitespace/simple pluralization
**When:** entity resolution runs
**Then:**
- [ ] the two nodes are merged into one
- [ ] no LLM adjudication call is made

#### Test: Different normalized names are not over-merged
**Type:** Unit
**Source:** Issue 4 — criterion 3
**Given:** two concept nodes with genuinely different normalized names
**When:** the string-match tier runs
**Then:**
- [ ] the two nodes remain separate

#### Test: High embedding similarity merges without an LLM call
**Type:** Unit
**Source:** Feature: Tiered Entity Resolution Pipeline — criterion 2 (embedding tier); Issue 5 — criterion 1
**Given:** two concepts with embedding similarity above the merge threshold (e.g. "ML" vs "Machine Learning"), using an injected threshold value
**When:** the embedding-similarity tier runs
**Then:**
- [ ] the two nodes are merged
- [ ] no LLM adjudication call is made

#### Test: Ambiguous-band similarity triggers LLM adjudication and applies its decision
**Type:** Unit
**Source:** Feature: Tiered Entity Resolution Pipeline — criterion 3; Issue 5 — criterion 2
**Given:** two concepts with similarity in the ambiguous middle band (using injected threshold bounds) and a mocked LLM adjudication response
**When:** entity resolution runs
**Then:**
- [ ] an LLM adjudication call is made
- [ ] the graph reflects the mocked call's decision (merged if "merge", kept separate if "keep separate")

#### Test: Low similarity concepts are left unmerged without an LLM call
**Type:** Unit
**Source:** Issue 5 — criterion 3
**Given:** two concepts with embedding similarity below the ambiguous band (using injected threshold bounds)
**When:** entity resolution runs
**Then:**
- [ ] the two nodes remain separate
- [ ] no LLM adjudication call is made

#### Test: Merging preserves source-file references from both original nodes
**Type:** Unit
**Source:** Feature: Tiered Entity Resolution Pipeline — criterion 4; Issue 4 — criterion 2; Issue 5 — criterion 4
**Given:** two concept nodes from different source files that are merged (via any tier)
**When:** the merge is applied
**Then:**
- [ ] the resulting node's source-file references include both original files' references

#### Test: Threshold boundary behavior is parameterized, not hardcoded
**Type:** Unit
**Source:** Issue 5 — caveat (open question: exact threshold values)
**Given:** a similarity score exactly at an injected threshold boundary value
**When:** the resolution tier evaluates it
**Then:**
- [ ] the test suite documents which side of the boundary is inclusive, driven by the injected config value — not a hardcoded number in the test itself
- [ ] `# OPEN QUESTION (Issue 5): exact threshold values require empirical tuning; this test exercises the boundary contract via a fixture-injected threshold`

---

### Graph Store

#### Test: Graph round-trips through JSON persistence
**Type:** Unit
**Source:** Feature: Concept Graph Persistence — criterion 1; Issue 1 — criterion 4
**Given:** an in-memory networkx graph with nodes and typed edges
**When:** the graph is persisted to JSON and reloaded
**Then:**
- [ ] the reloaded graph has the same nodes and edges as the original

#### Test: Persisted node data includes required fields
**Type:** Unit
**Source:** Feature: Concept Graph Persistence — criterion 2
**Given:** a graph node created during ingestion
**When:** the node is inspected
**Then:**
- [ ] the node has an id, name, description, and at least one source-file reference

#### Test: Persisted edge data includes required fields
**Type:** Unit
**Source:** Feature: Concept Graph Persistence — criterion 3
**Given:** a graph edge created during extraction
**When:** the edge is inspected
**Then:**
- [ ] the edge has a typed relation label and source/target node ids

#### Test: New concepts are added as new nodes with correct edges
**Type:** Unit
**Source:** Feature: Graph Update on Ingestion Events — criterion 1
**Given:** extraction output for a newly ingested file (concepts + relations)
**When:** the graph update step applies this output
**Then:**
- [ ] new nodes appear in the graph for each new concept
- [ ] edges match the relations extracted

#### Test: Resolved duplicate concepts are merged, not left separate
**Type:** Unit
**Source:** Feature: Graph Update on Ingestion Events — criterion 2
**Given:** entity-resolution output indicating two concepts should merge
**When:** the graph update step applies this output
**Then:**
- [ ] the graph contains one merged node, not two

#### Test: Deleting a file removes only nodes/edges solely attributable to it
**Type:** Unit
**Source:** Feature: Graph Update on Ingestion Events — criterion 3; Issue 7 — criteria 2, 3
**Given:** a graph with one concept referenced only by file A and another concept shared by files A and B
**When:** file A is deleted
**Then:**
- [ ] the concept referenced only by file A is removed from the graph
- [ ] the concept shared with file B remains, with file A's reference removed from it

---

### Vector Store

#### Test: Every ingested chunk produces a stored embedding
**Type:** Unit
**Source:** Feature: Chunk Embedding & Chroma Indexing — criterion 1
**Given:** a set of ingested chunks
**When:** embedding + indexing runs
**Then:**
- [ ] each chunk has a corresponding stored embedding in the Chroma collection

#### Test: A query embedding retrieves top-k nearest stored chunks
**Type:** Unit
**Source:** Feature: Chunk Embedding & Chroma Indexing — criterion 2
**Given:** a Chroma collection populated with known chunk embeddings
**When:** a query embedding is matched against the collection
**Then:**
- [ ] the top-k results are ranked by similarity and include the expected nearest chunk(s)

#### Test: Deleting a file's chunks removes their embeddings (no orphans)
**Type:** Unit
**Source:** Feature: Chunk Embedding & Chroma Indexing — criterion 3
**Given:** embeddings stored for a file's chunks
**When:** the file is deleted and cleanup runs
**Then:**
- [ ] no embeddings referencing the deleted file's chunks remain in Chroma

#### Test: Re-ingesting an unchanged file does not duplicate embeddings
**Type:** Unit
**Source:** Feature: Chunk Embedding & Chroma Indexing — criterion 4
**Given:** a file already ingested and embedded, with an unchanged hash
**When:** the ingestion pipeline runs again over the same folder
**Then:**
- [ ] no duplicate embeddings are created for that file's chunks

#### Test: A stored embedding is traceable back to its originating graph node id(s)
**Type:** Unit
**Source:** Feature: Chunk Embedding & Chroma Indexing — open question; Issue 3 — full criteria + caveat
**Given:** a chunk that produced one or more graph nodes during extraction, now embedded and stored
**When:** the stored embedding record is inspected
**Then:**
- [ ] the record contains a reference resolvable to the graph node id(s) that chunk produced (contract-level assertion only)
- [ ] `# OPEN QUESTION (Issue 3): exact Chroma collection schema / field name for the node-id link is undecided — this test must be updated once the schema is chosen; do not hardcode a field name here`

---

### Retrieval — Vector-Seeded Lookup

#### Test: A query returns a ranked top-k seed list
**Type:** Unit
**Source:** Feature: Vector-Seeded Concept Lookup — criterion 1; Issue 9 — criterion 1
**Given:** a populated Chroma collection and a query string
**When:** the query is embedded and matched
**Then:**
- [ ] a ranked top-k list of candidate chunks/concepts is returned

#### Test: Seed results include a concept/node id reference for traversal
**Type:** Unit
**Source:** Feature: Vector-Seeded Concept Lookup — criterion 2; Issue 9 — criterion 2
**Given:** seed results from a vector-search match
**When:** the results are inspected
**Then:**
- [ ] each seed result includes a concept/graph node id usable to start traversal

#### Test: Querying an empty or sparse graph returns an empty seed set without erroring
**Type:** Unit
**Source:** Feature: Vector-Seeded Concept Lookup — criterion 3; Issue 9 — criterion 3
**Given:** a Chroma collection with no or very few ingested chunks
**When:** a query is run
**Then:**
- [ ] an empty seed list is returned
- [ ] no exception is raised

---

### Retrieval — Bounded Graph Traversal

#### Test: Traversal starts only from seed nodes
**Type:** Unit
**Source:** Feature: LLM-Guided Bounded Graph Traversal — criterion 1; Issue 10 — criterion 1
**Given:** a graph and a set of vector-search seed nodes
**When:** traversal runs
**Then:**
- [ ] the first visited node(s) are drawn only from the seed set, not an arbitrary graph entry point

#### Test: Traversal never exceeds 3 hops
**Type:** Unit
**Source:** Feature: LLM-Guided Bounded Graph Traversal — criterion 2; Issue 10 — criterion 2
**Given:** a densely connected graph and a mocked traversal-reasoning LLM that always chooses to continue
**When:** traversal runs
**Then:**
- [ ] no visited node is more than 3 hops from its seed

#### Test: Traversal never visits more than 15 total nodes
**Type:** Unit
**Source:** Feature: LLM-Guided Bounded Graph Traversal — criterion 3; Issue 10 — criterion 3
**Given:** a densely connected graph with more than 15 reachable nodes within 3 hops, and a mocked traversal-reasoning LLM that always continues
**When:** traversal runs
**Then:**
- [ ] the total visited node count is capped at 15

#### Test: Each hop's next-edge choice is driven by an LLM call over neighbors
**Type:** Unit
**Source:** Feature: LLM-Guided Bounded Graph Traversal — criterion 4; Issue 10 — criterion 4
**Given:** a node with multiple outgoing edges and a mocked traversal-reasoning LLM
**When:** traversal decides its next hop
**Then:**
- [ ] the traversal-reasoning LLM is invoked with the current node's neighbor edges
- [ ] the next node visited matches the mocked LLM's chosen edge (not a fixed/blind rule like plain BFS order)

#### Test: Traversal output is an ordered, streamable step sequence
**Type:** Unit
**Source:** Feature: LLM-Guided Bounded Graph Traversal — criterion 5; Issue 10 — criterion 5
**Given:** a completed traversal run
**When:** the result is inspected
**Then:**
- [ ] the result is an ordered list of (node, edge, hop-number) steps in visitation order

---

### No-Match Detection

#### Test: All-below-cutoff results skip traversal and return not-found
**Type:** Unit
**Source:** Feature: Similarity-Cutoff Pre-Filter — criterion 1; Issue 12 — criterion 1
**Given:** top-k Chroma results all scoring below an injected similarity cutoff
**When:** the no-match pre-filter runs
**Then:**
- [ ] traversal is not invoked
- [ ] the Haiku answer call is not invoked
- [ ] the explicit "no relevant document found" message is returned

#### Test: At-least-one-above-cutoff proceeds to traversal
**Type:** Unit
**Source:** Feature: Similarity-Cutoff Pre-Filter — criterion 2; Issue 12 — criterion 3
**Given:** top-k Chroma results with at least one above an injected similarity cutoff
**When:** the no-match pre-filter runs
**Then:**
- [ ] traversal proceeds as normal

#### Test: Cutoff value is injectable, not hardcoded
**Type:** Unit
**Source:** Issue 12 — caveat (open question: exact cutoff value)
**Given:** two different injected cutoff configurations against the same similarity scores
**When:** the pre-filter runs under each configuration
**Then:**
- [ ] the pass/fail outcome changes according to the injected configuration, proving the cutoff is not hardcoded
- [ ] `# OPEN QUESTION (Issue 12): exact similarity-cutoff value requires empirical tuning; this test only proves the contract is configurable`

#### Test: Borderline context that doesn't answer the question returns not-found
**Type:** Unit
**Source:** Feature: LLM Double-Check for Borderline Relevance — criterion 1; Issue 12 — criterion 2
**Given:** traversed context that passed the cutoff but a mocked Haiku relevance-judgment response of "not relevant"
**When:** the double-check runs
**Then:**
- [ ] the explicit not-found message is returned instead of a fabricated answer

#### Test: Borderline context that does answer the question proceeds to summary
**Type:** Unit
**Source:** Feature: LLM Double-Check for Borderline Relevance — criterion 2
**Given:** traversed context that passed the cutoff and a mocked Haiku relevance-judgment response of "relevant"
**When:** the double-check runs
**Then:**
- [ ] the flow proceeds to produce the 4-5 line summary answer

#### Test: Double-check only runs after the cutoff pre-filter has passed
**Type:** Unit
**Source:** Feature: LLM Double-Check for Borderline Relevance — criterion 3
**Given:** a query whose top-k results are all below cutoff
**When:** the full no-match flow runs
**Then:**
- [ ] the double-check (Haiku relevance judgment) is never invoked — the pre-filter short-circuits first

---

### Chat Session

#### Test: A follow-up question has the prior turn available as context
**Type:** Unit
**Source:** Feature: Single Session Per Folder with Sliding-Window Memory — criterion 1; Issue 13 — criterion 1
**Given:** a session with one prior Q&A turn
**When:** a follow-up query is issued referencing that turn
**Then:**
- [ ] the prior turn's content is present in the context passed to seeding and answer generation

#### Test: Session context never exceeds the last 5 turns
**Type:** Unit
**Source:** Feature: Single Session Per Folder with Sliding-Window Memory — criterion 2; Issue 13 — criterion 2
**Given:** a session with more than 5 prior Q&A turns
**When:** a new query is issued
**Then:**
- [ ] only the most recent 5 turns are present in the context window

#### Test: Switching folders starts a fresh session
**Type:** Unit
**Source:** Feature: Single Session Per Folder with Sliding-Window Memory — criterion 3; Issue 13 — criterion 3
**Given:** an active session with turn history for folder A
**When:** the watched folder is switched to folder B
**Then:**
- [ ] the new session for folder B has no turn history carried over from folder A

#### Test: Session state does not survive a backend restart (current default assumption)
**Type:** Unit
**Source:** Issue 13 — caveat (open question: chat persistence across restart)
**Marked:** `xfail` / pending — documents the currently-assumed default; must be revisited once persistence is explicitly decided.
**Given:** an active session with turn history
**When:** the backend process restarts (simulated) and a new query is issued for the same folder
**Then:**
- [ ] under the PRD's stated default (in-memory only), the new session has no turn history from before the restart
- [ ] `# OPEN QUESTION (Issue 13): whether session state should persist across restarts is unresolved. This test asserts today's default (in-memory only) and is marked xfail/pending so it's revisited — not silently treated as final — once a persistence decision is made.`

---

### Answer Generation

#### Test: Relevant context produces a 4-5 line answer
**Type:** Unit
**Source:** Feature: Claude Haiku Summary Answer — criterion 1; Issue 11 — criterion 1
**Given:** traversed context relevant to a query and a mocked Haiku response
**When:** the answer call runs
**Then:**
- [ ] the returned answer is 4-5 lines long

#### Test: Answer content is grounded in traversed context only
**Type:** Unit
**Source:** Feature: Claude Haiku Summary Answer — criterion 2; Issue 11 — criterion 2
**Given:** traversed context with known, narrow content and a mocked Haiku response
**When:** the answer call runs
**Then:**
- [ ] the answer does not introduce content absent from the traversed context (mock constructed so ungrounded additions are detectable)

#### Test: Answer call incorporates sliding-window session context
**Type:** Unit
**Source:** Feature: Claude Haiku Summary Answer — criterion 3
**Given:** a session with prior turns and a new follow-up query
**When:** the answer call is constructed
**Then:**
- [ ] the prompt sent to Haiku includes the sliding-window session context alongside the current traversed context

---

### Concurrency

#### Test: Lock is acquired before a graph/vector-store write and released after
**Type:** Unit
**Source:** Feature: Ingestion/Query Lock Guarding — criterion 1 (unit-level lock behavior); Issue 17 — criterion 1
**Given:** an ingestion write operation and a lock/mutex wrapping graph_store + vector_store access
**When:** the write operation executes
**Then:**
- [ ] the lock is held for the duration of the write and released afterward

#### Test: A query read acquires the same lock briefly
**Type:** Unit
**Source:** Issue 17 — criterion 1
**Given:** a query read operation against graph_store/vector_store
**When:** the read executes
**Then:**
- [ ] the same lock is acquired for the read and released promptly after

#### Test: Lock prevents a write and a read from proceeding simultaneously
**Type:** Unit
**Source:** Feature: Ingestion/Query Lock Guarding — criterion 2; Issue 17 — criterion 2
**Given:** a held write lock
**When:** a concurrent read attempts to acquire the lock
**Then:**
- [ ] the read blocks until the write releases the lock (verified via a controlled interleaving in the test)

---

## Integration Tests

### Ingestion Pipeline

#### Test: Single markdown file ingests end-to-end into a persisted graph
**Type:** Integration
**Source:** Issue 1 — full acceptance criteria; PRD user stories 8, 9, 11
**Given:** a single local markdown file with headings and related concepts
**When:** the ingestion pipeline runs (load → chunk → extract → persist), using a mocked extraction LLM with a realistic structured response
**Then:**
- [ ] the persisted graph JSON contains nodes for the concepts in the mocked response
- [ ] edges carry the typed relation labels from the mocked response
- [ ] reloading the persisted JSON reconstructs an equivalent graph

#### Test: Mixed-format folder (md, txt, pdf) ingests correctly
**Type:** Integration
**Source:** Issue 2 — full acceptance criteria; PRD user story 7
**Given:** a folder containing one `.md`, one `.txt`, and one `.pdf` file
**When:** the ingestion pipeline runs over the folder
**Then:**
- [ ] all three files are loaded, chunked (heading-based for md/pdf-with-headings, paragraph-based for txt/pdf-without-headings), and extracted
- [ ] an unsupported file placed in the same folder is skipped without halting the run

#### Test: Ingested chunks are embedded and traceable to their graph nodes end-to-end
**Type:** Integration
**Source:** Issue 3 — full acceptance criteria
**Given:** a freshly ingested file producing both graph nodes and Chroma embeddings
**When:** the full ingest run completes
**Then:**
- [ ] a query embedding retrieves the expected chunk from Chroma
- [ ] the retrieved chunk resolves back to the graph node id(s) it produced (contract-level; exact field TBD per Issue 3 open question)

---

### Entity Resolution Pipeline

#### Test: Cross-file synonym concepts merge end-to-end via string tier
**Type:** Integration
**Source:** Issue 4 — full acceptance criteria
**Given:** two files, each mentioning a concept under identically-normalized names
**When:** both files are ingested and resolution runs
**Then:**
- [ ] the graph contains a single merged node referencing both files

#### Test: Cross-file synonym concepts merge end-to-end via embedding + LLM adjudication
**Type:** Integration
**Source:** Issue 5 — full acceptance criteria
**Given:** two files mentioning conceptually equivalent but differently-worded concepts (e.g. "ML" / "Machine Learning"), with mocked embedding similarity and (if ambiguous) mocked LLM adjudication
**When:** both files are ingested and resolution runs
**Then:**
- [ ] the graph contains a single merged node referencing both files
- [ ] the adjudication path taken (embedding-only vs. LLM-adjudicated) matches the mocked similarity band

---

### Incremental Ingestion & Startup

#### Test: Adding a file to the watched folder triggers ingestion for that file only
**Type:** Integration
**Source:** Feature: Folder Watcher & Incremental Change Detection — criterion 1; Issue 6 — criterion 1
**Given:** a running watcher over a folder with existing ingested files
**When:** a new file is added to the folder
**Then:**
- [ ] only the new file is ingested; existing files' hashes/graph entries are untouched

#### Test: Unchanged file re-save does not trigger re-extraction
**Type:** Integration
**Source:** Feature: Folder Watcher & Incremental Change Detection — criterion 2; Issue 6 — criterion 2
**Given:** an ingested file with a recorded hash
**When:** the file is re-saved with identical content
**Then:**
- [ ] no re-extraction call is made for that file

#### Test: Rapid successive saves are debounced into one ingestion pass
**Type:** Integration
**Source:** Feature: Folder Watcher & Incremental Change Detection — criterion 5; Issue 6 — criterion 4
**Given:** a file receiving several rapid successive write events (simulated autosave)
**When:** the watcher processes these events
**Then:**
- [ ] exactly one ingestion pass runs for that file, not one per write event

#### Test: Deleting a watched file cleans up graph and vector store
**Type:** Integration
**Source:** Issue 7 — full acceptance criteria
**Given:** an ingested file with graph nodes and Chroma embeddings, some concepts shared with another file
**When:** the file is deleted from the watched folder
**Then:**
- [ ] Chroma embeddings solely from the deleted file are removed
- [ ] graph nodes/edges solely attributable to the deleted file are removed
- [ ] concepts shared with the other still-present file remain in the graph

#### Test: Startup loads persisted graph immediately, then reconciles offline changes
**Type:** Integration
**Source:** Issue 8 — full acceptance criteria
**Given:** a previously persisted graph/hash-store, and a watched folder where a file was added and another deleted while the backend was "offline" (simulated)
**When:** the backend starts up
**Then:**
- [ ] the persisted graph is available immediately, before the background diff-scan completes
- [ ] the background scan ingests the offline-added file
- [ ] the background scan cleans up the offline-deleted file
- [ ] files unchanged since last persisted hash are not re-processed

#### Test: First-ever startup with no prior persisted state performs a full initial ingestion
**Type:** Integration
**Source:** Issue 8 — criterion 5
**Given:** no prior persisted graph/hash-store exists, and a watched folder with files present
**When:** the backend starts up
**Then:**
- [ ] a full ingestion run occurs instead of failing or waiting indefinitely

---

### RAG Query Pipeline

#### Test: A relevant query returns a grounded 4-5 line answer end-to-end
**Type:** Integration
**Source:** Issue 11 — full acceptance criteria; PRD user stories 12, 13, 14
**Given:** an ingested graph/vector store with material relevant to a test query, mocked traversal-reasoning and Haiku responses
**When:** a chat query is submitted
**Then:**
- [ ] the query is seeded from vector search, traversed (bounded 3 hops/15 nodes), and answered
- [ ] the final answer is 4-5 lines and grounded in the traversed context

#### Test: A query with no relevant material returns the explicit not-found message
**Type:** Integration
**Source:** Issue 12 — criterion 1; PRD user story 15
**Given:** an ingested graph/vector store with no material relevant to a test query
**When:** a chat query is submitted
**Then:**
- [ ] traversal and the Haiku answer call are both skipped
- [ ] the explicit "no relevant document found" message is returned

#### Test: A borderline query is caught by the Haiku double-check
**Type:** Integration
**Source:** Issue 12 — criterion 2
**Given:** a query whose vector search passes cutoff but whose traversed context doesn't actually answer the question (mocked Haiku judgment = not relevant)
**When:** a chat query is submitted
**Then:**
- [ ] the explicit not-found message is returned rather than a fabricated answer

#### Test: A follow-up query resolves using sliding-window session context end-to-end
**Type:** Integration
**Source:** Issue 13 — criterion 1; PRD user story 16
**Given:** a prior turn established in an active session
**When:** a follow-up query referencing that turn is submitted
**Then:**
- [ ] the follow-up resolves correctly using the prior turn as context (seeding + answer both reflect it)

#### Test: Switching folders mid-conversation starts a clean session end-to-end
**Type:** Integration
**Source:** Issue 13 — criterion 3; Issue 15 — criterion 3
**Given:** an active session with turn history for folder A
**When:** the folder is switched to folder B and a new query is submitted
**Then:**
- [ ] the new query's context contains no turn history from folder A

---

### Concurrency Integration

#### Test: A query running during an ingestion write never sees a partially-updated graph
**Type:** Integration
**Source:** Feature: Ingestion/Query Lock Guarding — criterion 1; Issue 17 — criterion 1
**Given:** an ingestion write in progress (simulated with a controlled delay) and a concurrent query read
**When:** both run concurrently
**Then:**
- [ ] the query read observes either the fully-pre-write or fully-post-write graph state, never a partial mutation

#### Test: Near-simultaneous file-change event and chat query do not deadlock
**Type:** Integration
**Source:** Feature: Ingestion/Query Lock Guarding — criterion 3; Issue 17 — criterion 3
**Given:** a file-change event and a chat query triggered in close succession
**When:** both are processed
**Then:**
- [ ] both complete within a bounded timeout (no deadlock)

---

## API / Contract Tests

### Folder Configuration Endpoint

#### Test: First load reflects WATCH_FOLDER as the default
**Type:** API
**Source:** Feature: Folder Configuration Endpoint — criterion 1; Issue 15 — criterion 1
**Given:** a freshly started backend with `WATCH_FOLDER` set in `.env` and no prior folder selection
**When:** the folder-configuration endpoint is called (`# TODO: exact path/method pending Issue 15 resolution — placeholder used below`)
**Then:**
- [ ] the response reflects `WATCH_FOLDER` as the current/default folder

#### Test: Submitting a new folder path tears down and restarts the watcher
**Type:** API
**Source:** Feature: Folder Configuration Endpoint — criterion 2; Issue 15 — criterion 2
**Given:** a backend actively watching folder A
**When:** a request is submitted to switch to folder B (`# TODO: placeholder endpoint`)
**Then:**
- [ ] the watcher/hash-store for folder A is torn down
- [ ] a fresh watcher/hash-store is started scoped to folder B

#### Test: Submitting a new folder path resets the chat session
**Type:** API
**Source:** Feature: Folder Configuration Endpoint — criterion 3; Issue 15 — criterion 3
**Given:** an active chat session with turn history for folder A
**When:** a request switches the folder to B
**Then:**
- [ ] the session associated with the new folder has no carried-over turn history

#### Test: Submitting an invalid folder path returns an error without crashing
**Type:** API
**Source:** Feature: Folder Configuration Endpoint — criterion 4; Issue 15 — criterion 4
**Given:** a running backend
**When:** a request submits a non-existent/invalid path
**Then:**
- [ ] the response is an error (4xx) rather than a crash or hang
- [ ] the backend continues serving subsequent requests normally

#### Test: Folder-configuration request/response shape is pending finalization
**Type:** API
**Source:** Issue 15 — caveat (open question: exact endpoint path/payload shape)
**Marked:** pending / `skip` — placeholder documenting intent only.
**Given:** no finalized endpoint contract yet
**When:** this test is implemented
**Then:**
- [ ] `# OPEN QUESTION (Issue 15): exact endpoint path, HTTP method, and request/response payload are undecided. Replace the placeholder path/method below once settled, then unskip.`

---

### Graph Read Endpoint

#### Test: Graph read returns all current nodes and edges
**Type:** API
**Source:** Feature: Graph Read Endpoint — criterion 1; Issue 16 — criterion 1
**Given:** a backend with an ingested graph
**When:** the graph-read endpoint is called (`# TODO: placeholder path pending Issue 16 resolution`)
**Then:**
- [ ] the response includes all currently persisted nodes and edges

#### Test: Each returned edge includes its relation-type label
**Type:** API
**Source:** Feature: Graph Read Endpoint — criterion 2; Issue 16 — criterion 2
**Given:** a graph containing typed edges
**When:** the graph-read endpoint is called
**Then:**
- [ ] every edge in the response includes a non-empty relation-type label

#### Test: Graph read before any ingestion returns an empty graph, not an error
**Type:** API
**Source:** Feature: Graph Read Endpoint — criterion 3; Issue 16 — criterion 3
**Given:** a freshly started backend with no ingestion completed yet
**When:** the graph-read endpoint is called
**Then:**
- [ ] the response is a valid empty-graph payload (200-class response), not an error

#### Test: Graph-read response shape/pagination is pending finalization
**Type:** API
**Source:** Issue 16 — caveat (open question: response shape/pagination for large graphs)
**Marked:** pending / `skip` — placeholder documenting intent only.
**Given:** no finalized response contract yet for large graphs
**When:** this test is implemented
**Then:**
- [ ] `# OPEN QUESTION (Issue 16): exact response payload shape and pagination behavior for large graphs are undecided. Fill in once settled, then unskip.`

---

### WebSocket Traversal Streaming

#### Test: Traversal produces one streamed event per visited node/edge
**Type:** API
**Source:** Feature: Traversal-Step Streaming — criterion 1; Issue 14 — criterion 1
**Given:** a WebSocket connection and a query that triggers a multi-hop traversal
**When:** the query is submitted over the WS connection
**Then:**
- [ ] one discrete event is received per visited node/edge, not a single batched dump at the end

#### Test: Each streamed step event includes concept and hop number
**Type:** API
**Source:** Feature: Traversal-Step Streaming — criterion 2; Issue 14 — criterion 2
**Given:** a streamed traversal-step event
**When:** the event payload is inspected
**Then:**
- [ ] the event includes at minimum the concept visited and its hop number

#### Test: A distinct completion event signals traversal end
**Type:** API
**Source:** Feature: Traversal-Step Streaming — criterion 3; Issue 14 — criterion 3
**Given:** a completed traversal streamed over WS
**When:** all step events have been received
**Then:**
- [ ] a completion event distinct from the visit-node events is received

#### Test: The final answer arrives as its own event after completion
**Type:** API
**Source:** Feature: Traversal-Step Streaming — criterion 4; Issue 14 — criterion 4
**Given:** a completed traversal and generated answer, streamed over WS
**When:** the full event sequence is inspected
**Then:**
- [ ] the final answer (or not-found message) is delivered as its own event
- [ ] this event arrives strictly after the completion event, not interleaved among visit-node events

#### Test: Full WS message schema is pending finalization
**Type:** API
**Source:** Issue 14 — caveat (open question: full message schema incl. error events)
**Marked:** pending / `skip` — placeholder documenting intent only.
**Given:** no finalized full event-type schema yet (only the illustrative `{type: "visit_node", concept: "X", hop: 2}` sketch exists)
**When:** this test is implemented
**Then:**
- [ ] `# OPEN QUESTION (Issue 14): the complete WS message schema (all event types, including error/interrupt events) is undecided beyond the illustrative sketch. Fill in the full contract once settled, then unskip.`

---

## Coverage Notes

- Every feature in `features.md` (20 total) has at least one unit and/or integration test above.
- Every issue in `issues.md` (17 total) has at least one test referencing it directly by number.
- The six pinned open items (Issues 3, 5, 12, 13, 14, 15/16) each have a dedicated contract-level test marked with an `# OPEN QUESTION` comment and, where the contract truly cannot be exercised without a decided value/shape, a `pending`/`skip`/`xfail` marker — these should be revisited (not silently deleted) once the corresponding design decision is made.
- PRD user stories are covered transitively through the Integration and API sections above (each integration/API test traces back to the user-story-driving feature/issue).
