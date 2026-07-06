# Worker Brief: GraphStore JSON round-trip `id` bug fix

## Context
This is a small, targeted remediation slipped in between Round 2 and Round 3 of the docuFetch Graph backend build. It is NOT a new issue from `issues.md` — it's a bug found by Round 2's `worker-graph-api` (Issue 16) while building `GET /api/graph`, and it needs a proper source-level fix before Round 3 (entity resolution, Issue 4/5) starts, since Round 3 will read node `id` fields off graphs loaded from disk.

## The bug
`backend/graph_store/store.py`'s `GraphStore.add_extraction_result` creates nodes with an `id` data attribute equal to the node's own networkx graph key (e.g. `graph.add_node("concept_foo", id="concept_foo", name=..., ...)`). This is redundant by construction, but `features.md`'s "Concept Graph Persistence" acceptance criterion requires "Node data includes at minimum an id, name, description, and source file reference(s)" — and `tests/unit/test_graph_store.py::test_persisted_node_data_includes_required_fields` asserts `data["id"] == node_id` on nodes.

That test currently passes ONLY because it asserts against a graph that was never round-tripped through JSON (`GraphStore(graph=sample_graph)`, no `persist`/`load` involved). Verify this yourself by reading `docs/backend/tests/unit/test_graph_store.py::test_persisted_node_data_includes_required_fields` and `test_graph_round_trips_through_json_persistence` — neither actually checks `data["id"]` on a *reloaded* graph.

The real bug: `networkx.node_link_data`/`node_link_graph` reserve the attribute name `"id"` as the special field that stores the node's own graph key in the JSON — and on reload, `node_link_graph` consumes that field to name the node but does **not** put it back into the node's data dict. Reproduce it yourself:
```python
import networkx as nx, json
g = nx.MultiDiGraph()
g.add_node("concept_a", id="concept_a", name="A", description="d", source_files=["f.md"])
data = nx.node_link_data(g)
g2 = nx.node_link_graph(data, directed=True, multigraph=True)
print(dict(g2.nodes(data=True))["concept_a"])  # {'name': 'A', 'description': 'd', 'source_files': ['f.md']} -- NO 'id' key!
```
So any `GraphStore.load(path)` followed by `graph.nodes[node_id]["id"]` raises `KeyError`. Round 2's `worker-graph-api` hit exactly this and worked around it locally in `backend/api/graph_routes.py` (using the node's graph key directly instead of `data["id"]`) — that workaround is fine and doesn't need to change, but the underlying bug will bite every future round that reads a *reloaded* graph's `id` field: Issue 4/5 (entity resolution over the persisted graph), Issue 6/7/8 (watcher/startup reading loaded graphs), Issue 9/10 (retrieval reading node ids for traversal).

## What to build (the fix — small and surgical, per CLAUDE.md)
In `backend/graph_store/store.py`, modify the `load` classmethod only: after `graph = nx.node_link_graph(data, directed=True, multigraph=True)`, backfill each node's `id` attribute from its own graph key before returning:
```python
for node_id in graph.nodes:
    graph.nodes[node_id].setdefault("id", node_id)
```
Use `setdefault` (not a blind overwrite) so this is a no-op if some future change ever does preserve `id` natively. Do NOT change `persist()` — the JSON on disk is already correct (it round-trips the node key correctly; the loss only happens because of how the data dict gets reconstructed on load, not because of what's serialized). Do NOT change `add_extraction_result`, `merge_nodes`, or `remove_file` — they operate on in-memory graphs that already have `id` set correctly at creation time; this bug only manifests after a `persist` → `load` cycle.

Add a short comment above the fix explaining why it's needed (one sentence, referencing the node_link_data/node_link_graph `id`-field reservation), so nobody "cleans it up" later thinking it's redundant.

## What NOT to build
- Do not touch `backend/api/graph_routes.py` — its existing workaround (using the node's graph key directly) still works fine after this fix and doesn't need to change; leave it alone (CLAUDE.md: surgical changes only, don't touch code that isn't yours to fix).
- Do not add a general "id" field migration/versioning system — this is a one-line defensive backfill, not a schema migration framework.
- Do not touch `chunking.py`, `loaders.py`, `pipeline.py`, `vector_store/` — other Round 2 workers may still be finishing work there; you only touch `backend/graph_store/store.py`.

## Test requirement
Add ONE new regression test to `docs/backend/tests/unit/test_graph_store.py`: a test that persists a `sample_graph` to a tmp path, reloads it via `GraphStore.load`, and asserts every reloaded node's `data["id"] == node_id` (the graph key) — this is the exact case the existing tests didn't cover. Name it `test_reloaded_node_data_includes_id_field_after_json_round_trip` (or similar). Then run the full existing `test_graph_store.py` suite (`pytest docs/backend/tests/unit/test_graph_store.py -v`) — confirm all 6 pre-existing tests still pass plus your new one (7/7).

Also re-run `pytest docs/backend/tests/api/test_graph_read_endpoint.py -v` (Round 2's graph-api tests) to confirm your fix doesn't change their behavior (they should still pass — they already work around this bug independently, so this is just confirming no regression, not requiring any change on your part).

## What to write in your report
Write `/workspace/docs/backend/agent-reports/worker-graphstore-fix-report.md`:
- The exact diff to `backend/graph_store/store.py`.
- The new regression test added, and confirmation all 7 tests in `test_graph_store.py` pass plus the 4 in `test_graph_read_endpoint.py` still pass.
- Confirm you touched ONLY `backend/graph_store/store.py` and `docs/backend/tests/unit/test_graph_store.py`.

Append a brief note to `docs/backend/backend_context.md`'s Round log (new short entry, do not rewrite existing entries) documenting this fix and citing that Round 2's `worker-graph-api` first surfaced it.

Run the tests before reporting done.
