"""
Centralized configuration for the docuFetch Graph backend. Loads environment
variables from the project's .env file via python-dotenv and exposes them as
named constants so every other module reads config from here instead of
calling os.getenv directly.
"""
import os

from dotenv import load_dotenv

load_dotenv()

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
HASH_STORE_PATH = os.getenv("HASH_STORE_PATH", "./hash_store.json")
UPLOADS_PATH = os.getenv("UPLOADS_PATH", "./uploads")

# Round 1 decision: graph JSON persistence path, sibling to HASH_STORE_PATH.
# Overridable via a GRAPH_STORE_PATH env var, defaulting alongside the other
# on-disk stores. See docs/backend/backend_context.md "Round 1 decisions".
GRAPH_STORE_PATH = os.getenv("GRAPH_STORE_PATH", "./graph_store.json")

# Local embedding model (fastembed/ONNX, downloaded once on first use) —
# runs on CPU with no API key, rate limit, or network dependency.
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL")

# Entity-resolution cosine-similarity bands, tuned empirically against the
# local fastembed model BAAI/bge-small-en-v1.5 (2026-07-10, real prose):
# same-concept phrasings score ~0.88-0.96, related-but-distinct concepts
# ~0.73, unrelated ~0.5. >= merge auto-merges; [ambiguous_low, merge) goes
# to Haiku adjudication; below stays unmerged. (Each embedding model has its
# own similarity distribution — re-measure these whenever EMBED_MODEL
# changes; earlier tunings: Gemini 0.85/0.68, OpenRouter 0.90/0.75.)
# ambiguous_low sits at 0.84 (not lower): measured same-concept pairs never
# scored below ~0.876, and every ambiguous pair costs a Haiku call.
ENTITY_RESOLUTION_MERGE_THRESHOLD = float(os.getenv("ENTITY_RESOLUTION_MERGE_THRESHOLD", "0.90"))
ENTITY_RESOLUTION_AMBIGUOUS_LOW = float(os.getenv("ENTITY_RESOLUTION_AMBIGUOUS_LOW", "0.84"))
# Hard ceiling on LLM adjudication calls per resolution pass: a large batch
# ingest can surface hundreds of ambiguous pairs, each costing a ~1s Haiku
# call while GRAPH_LOCK is held (measured live: a 6-file ingest piled up 726
# raw nodes before its single resolution pass). Pairs beyond the cap are
# left unmerged (logged) rather than stalling ingestion for tens of minutes.
ENTITY_RESOLUTION_MAX_ADJUDICATIONS = int(os.getenv("ENTITY_RESOLUTION_MAX_ADJUDICATIONS", "150"))
# Chroma squared-L2 distance over unit-normalized embeddings (= 2 - 2*cos_sim,
# range 0-4, lower = more similar). Tuned empirically against
# BAAI/bge-small-en-v1.5 (2026-07-10): relevant queries' nearest-chunk
# distances scored 0.50-0.70, nonsense queries 1.00-1.17, so 0.85 sits at
# the midpoint of the separation band. Re-measure on EMBED_MODEL changes
# (earlier tunings: Gemini 0.95, OpenRouter 1.35).
NO_MATCH_SIMILARITY_CUTOFF = float(os.getenv("NO_MATCH_SIMILARITY_CUTOFF", "0.85"))
