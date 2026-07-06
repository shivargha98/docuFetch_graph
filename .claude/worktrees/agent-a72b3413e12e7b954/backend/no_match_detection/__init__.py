"""
No-match detection package (Issue 12): the two-stage not-found path for
backend.query_service.answer_query - a similarity-cutoff pre-filter that
skips traversal entirely when nothing looks relevant, plus a Haiku-side
relevance double-check for queries that pass the pre-filter but whose
traversed context turns out not to actually answer the question. See
detector.py for the implementation; re-exported here so callers can use
`no_match_detection.passes_cutoff(...)` etc. directly off the package.
"""
from backend.no_match_detection.detector import NOT_FOUND_MESSAGE, check_relevance, passes_cutoff

__all__ = ["NOT_FOUND_MESSAGE", "check_relevance", "passes_cutoff"]
