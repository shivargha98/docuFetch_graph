# docuFetch Graph

A personal LLM wiki. Point it at a folder of documents and it builds a live concept graph — an LLM extracts concepts and typed relations from every file (including links *across* files), and a chat lets you ask questions answered by actually traversing that graph, with the walk visualized in real time. If no relevant document exists, it says so instead of guessing.

## How it works

1. **Ingest** — drop a folder (uploaded as a server-side copy) or browse to one on disk (watched live). Files (`.md`, `.txt`, `.pdf`) are chunked; Claude Haiku extracts concepts + relations per chunk; a local embedding model (fastembed, `BAAI/bge-small-en-v1.5`) embeds every chunk on your CPU; duplicate concepts across files are merged (embedding similarity + LLM adjudication).
2. **Explore** — the graph renders as a still, compact 2D neon constellation: hover a node for its name, click for details (description, source files, linked concepts). Edge colors encode relation types.
3. **Ask** — the bottom-right chat seeds a vector search, then LLM-guided traversal hops the graph (max 3 hops / 15 nodes), highlighting its path live. Claude Haiku writes a 4–5 line answer grounded only in what it found — or an explicit "no relevant document."

A watched (linked) folder re-ingests automatically on file changes; an uploaded copy refreshes when you re-drop it.

**Stack:** FastAPI + networkx + Chroma (backend) · React + Tailwind + react-force-graph (frontend) · Claude Haiku (extraction, traversal, merge adjudication, answers) · fastembed/bge-small (local embeddings).

## Setup

Requirements: Python 3.11+ (`uv` recommended), Node 20+, and an [Anthropic API key](https://console.anthropic.com). Embeddings run locally (no key; the ~30MB model downloads on first ingest).

```bash
git clone <repo> && cd docuFetch_graph
cp .env.example .env          # fill in ANTHROPIC_API_KEY

uv sync                        # backend deps (creates .venv)
cd frontend && npm install     # frontend deps
```

## Run

```bash
# Terminal 1 — backend (repo root, venv active)
uvicorn backend.main:app --port 8000 --reload

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open **http://localhost:5173**, click **▸ No folder — choose one** (top-left), and drop or browse to a folder. Watch the concept counter climb, then start asking.

## Notes

- **Costs:** ingestion calls Haiku once per chunk (plus merge adjudications) — cheap, but a large folder is not free. Embeddings are local and free.
- **Switching folders** always wipes and fully re-ingests (graph, embeddings, and chat session reset together).
- Runtime artifacts (`graph_store.json`, `hash_store.json`, `chroma_db/`, `uploads/`) are gitignored and safe to delete — they regenerate on the next ingest.
- Tests: `pytest` (backend, from repo root) · `npx vitest run` (frontend, from `frontend/`).
