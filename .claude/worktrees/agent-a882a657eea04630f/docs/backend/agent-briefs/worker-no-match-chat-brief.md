# Worker Brief: No-Match Detection + Chat Session (Issues 12, 13)

## Context
Rounds 1-3 are complete and verified in `/workspace/backend/`. You're building two new modules (`backend/no_match_detection/`, `backend/chat_session/`) and extending `backend/query_service.py` (Round 3's architectural anchor) plus `backend/clients/anthropic_client.py`. You're running in parallel this round with `worker-watcher` (Issues 6/7/8) — they build `backend/ingestion/hash_store.py`, `watcher.py`, `startup.py`. **No file overlap between you.** You are the ONLY Round 4 worker touching `conftest.py` this round (the watcher worker needs no new fixtures), so unlike Round 3, you may write your fixture changes directly back to the shared `/workspace/docs/backend/tests/conftest.py` — no serial merge step needed this time.

**Critical: you must not break Round 3's already-passing integration test.** Read `/workspace/docs/backend/tests/integration/test_rag_query_pipeline.py::test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end` in full before touching `query_service.py` — it calls `answer_query("What is Machine Learning?", graph_store, chroma_test_client)` with exactly 3 positional args (no `folder_path`, no `history`), and it uses `mock_haiku_client` (which currently only mocks `generate_answer`) but does NOT separately mock `judge_relevance`. Your changes must keep this exact call signature working, and must not cause this test to invoke the real Anthropic API. See the specific instructions below for how to achieve both.

Read first: `/workspace/docs/backend/issues.md` (Issues 12, 13), `/workspace/docs/backend/features.md` ("No-Match Detection" and "Chat Session" modules), `/workspace/docs/backend/backend_context.md` (full — decision #3 was just corrected with the exact score-direction semantics you need; decision #4 confirms chat persistence is in-memory-only, final), then the actual current code:
- `/workspace/backend/query_service.py` — `answer_query(query, graph_store, vector_store, history=None) -> dict`, returns `{"answer", "traversal", "seeds"}`. `_build_context(graph_store, traversal) -> str` is a private helper you can reuse.
- `/workspace/backend/retrieval/seed.py` — `seed_from_query(query, vector_store, top_k=5) -> list[dict]`, each seed is `{"node_id", "score"}` where **`score` is a Chroma distance — lower means more similar** (confirmed and corrected in backend_context.md decision #3).
- `/workspace/backend/clients/anthropic_client.py` — `generate_answer` (implemented, Round 3); `judge_relevance(context: str, query: str) -> bool` is still a stub (`raise NotImplementedError`) — **yours to implement.**
- `/workspace/backend/config.py` — `NO_MATCH_SIMILARITY_CUTOFF = 0.35` already exists as the default.
- `docs/backend/tests/conftest.py`'s current `mock_haiku_client` fixture — read it exactly as merged (it monkeypatches `anthropic_client.generate_answer` only). Its docstring already says "whose final-answer response (or relevance double-check verdict) can be configured per-test" — that verdict-configuring part was never actually implemented. **You complete that promise** (see below), which is also what keeps the Round 3 test passing without modifying that test file at all.

## What to build

### 1. `backend/no_match_detection/__init__.py`, `backend/no_match_detection/detector.py`
- `NOT_FOUND_MESSAGE = "No relevant document found for this query."` (module-level constant).
- `passes_cutoff(seeds: list[dict], cutoff: float) -> bool` — returns `True` if **any** seed's `score <= cutoff` (small distance = relevant, per the corrected decision #3), `False` if every seed's score is above cutoff or `seeds` is empty.
- `check_relevance(context: str, query: str) -> bool` — thin wrapper delegating to `anthropic_client.judge_relevance(context, query)` (keeps `no_match_detection` as the single module owning both stages of the feature, per features.md's module grouping).

### 2. `backend/clients/anthropic_client.py::judge_relevance(context: str, query: str) -> bool`
Implement for real (replace the stub). Same `Anthropic(...)` client instance `generate_answer` already created — call `.messages.create(...)` with a system prompt asking the model to judge, strictly, whether `context` contains enough information to substantively answer `query`, responding with a single word or short JSON so you can parse a boolean (e.g. ask for exactly `"RELEVANT"` or `"NOT_RELEVANT"`, or JSON `{"relevant": bool}` — your call, document what you pick). No try/except needed beyond what's consistent with `generate_answer`'s existing precedent (no swallowing, per Round 3's documented choice) — but do document your decision either way.

### 3. `backend/chat_session/__init__.py`, `backend/chat_session/session.py`
Per backend_context.md decision #4 (in-memory only, single active session, final — not a placeholder):
- `@dataclass class ChatSession: folder_path: str; turns: deque = field(default_factory=lambda: deque(maxlen=5))` — each turn is a `{"query": str, "answer": str}` dict.
- Module-level state: a single "current session" (not a dict of all folders ever seen — the PRD says ONE ongoing session per *active* folder, not persistent per-folder history you can switch back into). A private `_current_session: ChatSession | None = None`.
- `get_or_create_session(folder_path: str) -> ChatSession` — if `_current_session` exists and its `folder_path` matches, return it; otherwise create a **fresh** `ChatSession(folder_path)` (empty turns), store it as `_current_session`, and return it. This automatically satisfies "switching folders starts a fresh session" (Issue 13 criterion 3) since a different `folder_path` always creates a new empty session.
- `start_new_session(folder_path: str) -> ChatSession` — force-creates and stores a fresh session for `folder_path` even if it matches the current one (for explicit resets — Round 5's folder-config endpoint will call this on every folder switch, even a no-op "switch to the same path" case).
- `add_turn(session: ChatSession, query: str, answer: str) -> None` — appends `{"query": query, "answer": answer}` to `session.turns` (the `deque(maxlen=5)` automatically drops the oldest turn once it exceeds 5, satisfying Issue 13 criterion 2).
- `get_history(session: ChatSession) -> list[dict]` — returns `list(session.turns)`.

### 4. Extend `backend/query_service.py::answer_query`
Change the signature to `answer_query(query: str, graph_store, vector_store, folder_path: str = "default", cutoff: float | None = None) -> dict` — **`folder_path` and `cutoff` are new OPTIONAL parameters with defaults; the old `history` parameter is removed** (chat history is now managed internally via `chat_session`, not passed in externally — this is the evolution Round 3's own docstring anticipated). Confirm the existing 3-positional-arg call in the Round 3 integration test (`answer_query(query, graph_store, vector_store)`) still works unchanged with these defaults.

New internal flow:
1. `session = chat_session.get_or_create_session(folder_path)`; `history = chat_session.get_history(session)`.
2. `seeds = seed_from_query(query, vector_store)`.
3. `if not no_match_detection.passes_cutoff(seeds, cutoff if cutoff is not None else NO_MATCH_SIMILARITY_CUTOFF):` → skip traversal AND skip `generate_answer` entirely, set `answer = no_match_detection.NOT_FOUND_MESSAGE`, still call `chat_session.add_turn(session, query, answer)`, return `{"answer": answer, "traversal": [], "seeds": seeds, "no_match": True}`.
4. Otherwise: `traversal = traverse(...)`, `context = _build_context(...)`, `if not no_match_detection.check_relevance(context, query):` → same not-found path as above but with `"traversal": traversal` populated (context was gathered, just judged irrelevant), `"no_match": True`.
5. Otherwise: `answer = generate_answer(context, query, history)`, `chat_session.add_turn(session, query, answer)`, return `{"answer": answer, "traversal": traversal, "seeds": seeds, "no_match": False}`.

### 5. Extend the existing `mock_haiku_client` fixture in `/workspace/docs/backend/tests/conftest.py`
This is the change that keeps Round 3's test green. Add `judge_relevance` mocking to the SAME fixture (it already monkeypatches `generate_answer`; add a second `monkeypatch.setattr(anthropic_client, "judge_relevance", fake_judge_relevance)` inside the same fixture function). Default the fake's relevance verdict to `True` ("relevant") so any test that already uses `mock_haiku_client` without explicitly configuring a verdict — like Round 3's integration test — gets the permissive default and the flow proceeds to `generate_answer` exactly as before, with zero changes needed to that test file. Add `.set_relevance(bool)` for tests (like yours) that need to configure "not relevant". Record calls (e.g. `.relevance_calls`) so tests can assert `check_relevance`/`judge_relevance` was invoked (or wasn't, for the cutoff short-circuit case).

## Tests you own
Run `pytest docs/backend/tests/unit/test_no_match_detection.py docs/backend/tests/unit/test_chat_session.py "docs/backend/tests/integration/test_rag_query_pipeline.py::test_query_with_no_relevant_material_returns_explicit_not_found_message" "docs/backend/tests/integration/test_rag_query_pipeline.py::test_borderline_query_caught_by_haiku_double_check" "docs/backend/tests/integration/test_rag_query_pipeline.py::test_followup_query_resolves_using_sliding_window_session_context" "docs/backend/tests/integration/test_rag_query_pipeline.py::test_switching_folders_mid_conversation_starts_clean_session_end_to_end" -v`

- All 6 tests in `test_no_match_detection.py` are yours. You'll need the `no_match_cutoff` fixture (still a stub in conftest.py — implement it: return `0.35`, matching `config.NO_MATCH_SIMILARITY_CUTOFF`, injectable per backend_context.md decision #3).
- All 4 tests in `test_chat_session.py` are yours EXCEPT the `xfail`-marked `test_session_state_does_not_survive_backend_restart` — per backend_context.md decision #4, this decision is now CONFIRMED FINAL (not still-open). **Remove the `@pytest.mark.xfail` marker and implement the test body as a normal passing assertion** (a "restart" is simulated by just not carrying over any in-memory session object — e.g. reset the module-level `_current_session` state, or the test can simply call `chat_session.start_new_session(folder_path)` again and assert empty history, whatever cleanly demonstrates the in-memory-only contract). Update the test's docstring to note the decision is final, citing backend_context.md.
- Exactly 4 of the 5 tests in `test_rag_query_pipeline.py` are yours this round (the 5th, `test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end`, is Round 3's and already passes — do not touch it, just don't break it).

## What NOT to build
- No persistence of chat sessions to disk — explicitly decided against, final (decision #4).
- Don't touch `backend/ingestion/`, `backend/entity_resolution/`, `backend/retrieval/`, `backend/vector_store/`, `backend/graph_store/` — not your files this round.
- No multi-session/multi-folder concurrent history — the PRD is explicit about a single active session at a time.

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-no-match-chat-report.md`:
- Files created/changed: `backend/no_match_detection/*.py`, `backend/chat_session/*.py`, `anthropic_client.py`'s new `judge_relevance`, `query_service.py`'s new signature/flow, and the extended `mock_haiku_client` fixture in `conftest.py`.
- Exact pytest results for your 6 + 4 + 4 = 14 owned tests.
- **Explicitly confirm you re-ran Round 3's `test_relevant_query_returns_grounded_four_to_five_line_answer_end_to_end` and it still passes unmodified** — this is the regression check that matters most this round.
- Your exact `judge_relevance` prompt/response parsing contract.
- Any deviation and why.

Run the tests before reporting done.
