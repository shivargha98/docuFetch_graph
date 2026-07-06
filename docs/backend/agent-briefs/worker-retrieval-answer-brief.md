# Worker Brief: Retrieval + Traversal + Answer (Issues 9, 10, 11)

## Context
Rounds 1-2 are complete and verified in `/workspace/backend/`. You're building three new modules (`backend/retrieval/`, `backend/answer_generation/`) plus a new top-level `backend/query_service.py` orchestrator — this last file is the architectural anchor that Round 4's no-match/chat-session worker and Round 5's WS-streaming/folder-config workers will extend, so keep its interface clean. You're running in parallel this round with `worker-entity-resolution` (Issues 4/5) — they build `backend/entity_resolution/` and touch `openrouter_client.py` (adding a different function, `adjudicate_merge`) and `graph_store` indirectly via `merge_nodes` (already exists, they don't modify `store.py` itself). No file overlap with you.

**Critical process instruction (read this before anything else):** Round 2 suffered real data loss because parallel workers each copied the shared `docs/backend/tests/conftest.py` file wholesale into and back out of their isolated worktrees — whichever worker finished last silently discarded the others' fixture additions to that same file. To prevent a repeat: **implement and verify your needed conftest.py fixtures ONLY inside your own worktree's copy of the file, for your own local test-running purposes. Do NOT write/copy your conftest.py changes back to `/workspace/docs/backend/tests/conftest.py` at the end of your run** (whether via the Edit/Write tools or via Bash `cp`/heredoc/script). Instead, put the **exact, complete code** for every fixture you added or modified in your final report. A dedicated follow-up worker will merge fixture additions from both Round 3 workers into the shared file in one serial pass, then re-run everyone's tests. Every other file you create should be written normally to `/workspace` as usual.

Read first: `/workspace/docs/backend/issues.md` (Issues 9, 10, 11), `/workspace/docs/backend/features.md` ("Retrieval" and "Answer Generation" modules), `/workspace/docs/backend/backend_context.md` (full), then the actual current code:
- `/workspace/backend/vector_store/store.py` — `VectorStore.query(query_text, top_k=5) -> list[dict]`, each result already shaped as `{"chunk_id", "source_file", "section", "graph_node_ids": list[str], "score"}`. `score` here is a Chroma **distance** (lower = more similar for the default cosine-ish metric Chroma uses) — check this yourself by reading the Chroma docs/behavior if you need to reason about ordering, since "top_k ranked by similarity" and "distance" may sort in opposite directions.
- `/workspace/backend/graph_store/store.py` — `GraphStore` wraps `networkx.MultiDiGraph`; nodes have `id`/`name`/`description`/`source_files`; edges (`graph.edges(data=True)` or `graph.out_edges`/`in_edges`) carry a `relation` label. `GraphStore.load(path)` now correctly backfills `id` on every node (fixed in Round 2.5 — safe to rely on `data["id"]`).
- `/workspace/backend/clients/openrouter_client.py` — has `extract_concepts`, `embed_text` implemented; `traversal_next_hop(*args, **kwargs) -> dict` is still a stub (`raise NotImplementedError`) — **this is yours to implement for real.**
- `/workspace/backend/clients/anthropic_client.py` — `generate_answer(context: str, query: str, history: list[dict]) -> str` is a stub — **yours to implement.** `judge_relevance` stays a stub (Issue 12, Round 4's problem, don't touch).

## What to build

### 1. `backend/retrieval/__init__.py`, `backend/retrieval/seed.py` (Issue 9)
- `seed_from_query(query: str, vector_store: VectorStore, top_k: int = 5) -> list[dict]` — calls `vector_store.query(query, top_k)`, transforms each Chroma match into one seed **per graph node id** it references (a chunk can map to multiple node ids; each becomes its own seed since traversal operates on graph nodes, not chunks): `{"node_id": ..., "score": ...}`. Deduplicate by `node_id` if the same node appears from multiple chunks (keep the best/lowest-distance score). If the vector store has no chunks at all, Chroma's `collection.query()` on an empty collection either returns empty result lists or raises, depending on version/state — **catch any exception here and return `[]`** so an empty/sparse graph never propagates an error up to the caller (per Issue 9's acceptance criterion 3).

### 2. `backend/retrieval/traversal.py` (Issue 10)
- `traverse(graph_store: GraphStore, seed_node_ids: list[str], query: str, max_hops: int = 3, max_nodes: int = 15) -> list[dict]`:
  - Start the visited set at the seed nodes (hop 0, `via_relation=None`), in the order given.
  - At each subsequent hop, for every node visited in the previous hop that hasn't exceeded `max_hops`, gather its neighbor edges (both outgoing via `graph_store.graph.out_edges(node_id, data=True)` and incoming via `in_edges`, since a concept's context can be relevant from either direction — treat each as a candidate `(neighbor_id, relation_label, direction)`), excluding neighbors already visited.
  - Call `openrouter_client.traversal_next_hop(current_node, neighbors, query)` — this is the one required LLM-reasoning call per Issue 10 criterion 4 ("each hop's next-edge choice is driven by an LLM call reasoning over the current node's neighbors, not a fixed/blind rule"). Design the function to return a dict like `{"next_node_id": "<id or null>", "relation": "<label or null>"}` — `next_node_id: null` means "stop traversing from this node" (the model can decide none of the neighbors are worth following).
  - Stop expanding a branch once `max_hops` is reached for it, and stop the ENTIRE traversal the instant total visited nodes hits `max_nodes` (whichever limit triggers first, per Issue 10 criteria 2/3).
  - Return an ordered list of steps: `{"node_id": ..., "concept": <node's name>, "hop": <int>, "via_relation": <label or None>}`, in visitation order — structured so Issue 14 (WS streaming, Round 5) can stream it directly without transformation.

### 3. `backend/clients/openrouter_client.py::traversal_next_hop(current_node: dict, neighbors: list[dict], query: str) -> dict`
Implement for real (replace the `raise NotImplementedError` stub). `current_node` is `{"node_id", "name", "description"}`; `neighbors` is a list of `{"node_id", "name", "relation", "direction"}`. Same `_client.chat.completions.create(model=OPENROUTER_LLM_MODEL, ...)` pattern as `extract_concepts`, with a system prompt asking the model which neighbor (if any) is worth following next to help answer `query`, responding with JSON `{"next_node_id": "<id>|null", "relation": "<label>|null"}`. Parse defensively — on failure/malformed response, default to `{"next_node_id": None, "relation": None}` (stop traversing that branch) rather than crashing the whole query.

### 4. `backend/answer_generation/__init__.py`, `backend/answer_generation/answer.py` (Issue 11)
- `generate_answer(context: str, query: str, history: list[dict] | None = None) -> str` — thin wrapper calling `anthropic_client.generate_answer(context, query, history or [])`.

### 5. `backend/clients/anthropic_client.py::generate_answer`
Implement for real using the `anthropic` SDK already in `requirements.txt`: `Anthropic(api_key=ANTHROPIC_API_KEY).messages.create(model=ANTHROPIC_MODEL, max_tokens=..., messages=[...])`. System/user prompt must instruct: answer in 4-5 lines, grounded ONLY in `context` (the traversed graph/chunk content passed in), incorporate `history` (a list of `{"query": str, "answer": str}` prior turns, possibly empty) as conversational context for follow-ups, and do not introduce information absent from `context`. Return the response text.

### 6. `backend/query_service.py` (new top-level orchestrator)
- `answer_query(query: str, graph_store: GraphStore, vector_store: VectorStore, history: list[dict] | None = None) -> dict` — orchestrates: `seed_from_query` → `traverse` → build a context string by concatenating the visited nodes' `name`/`description` (and their traversal relation labels) → `generate_answer`. Return `{"answer": <str>, "traversal": <list[dict] from traverse()>, "seeds": <list[dict] from seed_from_query()>}`. This function deliberately does NOT yet implement no-match detection (Issue 12) or real chat-session history management (Issue 13) — those are Round 4's job and will extend this exact function/file. For now, if `seed_from_query` returns an empty list, still call `traverse([])`/return a reasonable empty-context answer rather than crashing — Round 4 will replace this with the real cutoff-based short-circuit.

## Tests you own
Run (in your own worktree, against your locally-edited conftest.py):
`pytest docs/backend/tests/unit/test_retrieval.py docs/backend/tests/unit/test_answer_generation.py docs/backend/tests/integration/test_rag_query_pipeline.py::test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end -v`

All 8 tests in `test_retrieval.py` are yours, all 3 in `test_answer_generation.py` are yours, and exactly ONE test in `test_rag_query_pipeline.py` is yours this round (`test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end`) — the other 4 tests in that file (no-match, chat-session, folder-switch scoped) belong to Round 4/5 workers; leave them as `raise NotImplementedError`, do not touch them.

Implement these NEW fixtures in your OWN worktree's conftest.py copy only (report the exact code, do not write back to the shared file):
- `mock_traversal_llm` — monkeypatches `backend.clients.openrouter_client.traversal_next_hop`, same `.set_response()`/`.set_side_effect()` pattern as `mock_extraction_llm`. Since traversal calls this function repeatedly (once per hop, possibly per branch), consider supporting `.set_side_effect_sequence([...])` or a callable response so different calls can return different "next hop" decisions if a test needs it — but keep this simple; a single fixed `.set_response()` is fine if your test design doesn't need per-call variation (your call, document what you built).
- `mock_haiku_client` — monkeypatches `backend.clients.anthropic_client.generate_answer` (same pattern). Issue 12's double-check (`judge_relevance`) is NOT your concern this round — don't mock it.

## What NOT to build
- No streaming yet (that's Issue 14, Round 5) — `traverse()` just returns a plain list; don't build any WebSocket/generator/async-iterator interface for it now.
- No no-match cutoff logic, no chat session/history persistence — Round 4's job. `history` is just an accepted parameter you pass through, not something you manage the lifecycle of.
- Don't touch `backend/entity_resolution/`, `backend/ingestion/pipeline.py`, `backend/vector_store/store.py`, `backend/graph_store/store.py`, `backend/api/` — not your files this round.
- No caching/memoization of embeddings or LLM calls — not asked for.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-retrieval-answer-report.md`:
- Files created/changed: `backend/retrieval/seed.py`, `backend/retrieval/traversal.py`, `backend/answer_generation/answer.py`, `backend/query_service.py`, and the new functions added to `openrouter_client.py`/`anthropic_client.py`.
- **The complete, exact code for `mock_traversal_llm` and `mock_haiku_client`** as you implemented and verified them locally (verbatim, for the follow-up merge worker to copy into the shared conftest.py).
- Your exact `traversal_next_hop`/`generate_answer` request/response JSON shapes (so the merge worker and later rounds understand the contract).
- Exact pytest results for your 8 + 3 + 1 = 12 owned tests.
- Confirm you did NOT write conftest.py back to `/workspace/docs/backend/tests/conftest.py`.
- Any deviation and why (e.g. which direction(s) you chose for "neighbors" during traversal, exact context-string format passed to `generate_answer`).

Run the tests (in your worktree, against your local conftest.py copy) before reporting done.
