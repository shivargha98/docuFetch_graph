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

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL")

# Entity-resolution cosine-similarity bands, tuned empirically against
# gemini-embedding-001 (2026-07-09, real data): same-concept phrasings score
# ~0.82-0.83, related-but-distinct concepts ~0.63, unrelated ~0.52. Gemini's
# similarity range is compressed vs the earlier OpenRouter model (whose bands
# were 0.90/0.75) — under those old bands same-concept pairs would never
# auto-merge. >= merge auto-merges; [ambiguous_low, merge) goes to Haiku
# adjudication; below stays unmerged.
ENTITY_RESOLUTION_MERGE_THRESHOLD = float(os.getenv("ENTITY_RESOLUTION_MERGE_THRESHOLD", "0.85"))
ENTITY_RESOLUTION_AMBIGUOUS_LOW = float(os.getenv("ENTITY_RESOLUTION_AMBIGUOUS_LOW", "0.68"))
# Chroma squared-L2 distance over unit-normalized embeddings (= 2 - 2*cos_sim,
# range 0-4, lower = more similar). Tuned empirically against
# gemini-embedding-001 (2026-07-09, real ingested data): relevant queries'
# nearest-chunk distances scored 0.65-0.86, nonsense queries 1.05-1.14, so
# 0.95 sits at the midpoint of the separation band. (The previous 1.35 was
# tuned to the OpenRouter model's wider distribution — under Gemini it let
# every nonsense query through, so no-match never fired.)
NO_MATCH_SIMILARITY_CUTOFF = float(os.getenv("NO_MATCH_SIMILARITY_CUTOFF", "0.95"))
