"""
Centralized configuration for the docuFetch Graph backend. Loads environment
variables from the project's .env file via python-dotenv and exposes them as
named constants so every other module reads config from here instead of
calling os.getenv directly.
"""
import os

from dotenv import load_dotenv

load_dotenv()

WATCH_FOLDER = os.getenv("WATCH_FOLDER")
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
HASH_STORE_PATH = os.getenv("HASH_STORE_PATH", "./hash_store.json")

# Round 1 decision: graph JSON persistence path, sibling to HASH_STORE_PATH.
# Overridable via a GRAPH_STORE_PATH env var, defaulting alongside the other
# on-disk stores. See docs/backend/backend_context.md "Round 1 decisions".
GRAPH_STORE_PATH = os.getenv("GRAPH_STORE_PATH", "./graph_store.json")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_LLM_MODEL = os.getenv("OPENROUTER_LLM_MODEL")
OPENROUTER_EMBED_MODEL = os.getenv("OPENROUTER_EMBED_MODEL")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL")

# Placeholder tuning constants for later rounds (Issues 5 and 12). Not used by
# Issue 1, defined here now so config.py has a single owner for all tunables.
ENTITY_RESOLUTION_MERGE_THRESHOLD = float(os.getenv("ENTITY_RESOLUTION_MERGE_THRESHOLD", "0.90"))
ENTITY_RESOLUTION_AMBIGUOUS_LOW = float(os.getenv("ENTITY_RESOLUTION_AMBIGUOUS_LOW", "0.75"))
# Chroma squared-L2 distance over unit-normalized embeddings (= 2 - 2*cos_sim,
# range 0-4, lower = more similar). Tuned empirically against the live
# OPENROUTER_EMBED_MODEL: relevant queries scored 0.79-0.88, irrelevant ones
# 1.81-1.87, so 1.35 sits at the midpoint of the separation band (~cos_sim
# >= 0.325). The earlier 0.35 placeholder required cos_sim >= 0.825 and
# rejected everything.
NO_MATCH_SIMILARITY_CUTOFF = float(os.getenv("NO_MATCH_SIMILARITY_CUTOFF", "1.35"))
