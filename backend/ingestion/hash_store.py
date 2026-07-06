"""
On-disk record of each watched file's last-known content hash, used by the
folder watcher (Issue 6) and startup diff-scan (Issue 8) to decide whether a
file's content actually changed since it was last ingested, so unchanged
files can be skipped instead of re-running the extraction pipeline.
"""
import hashlib
import json
from pathlib import Path


def compute_file_hash(path: Path) -> str:
    """Return the sha256 hex digest of the file's raw bytes at `path`."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_hash_store(path: Path) -> dict[str, str]:
    """
    Load the `{absolute_file_path: hash}` JSON dict persisted at `path`.

    Returns an empty dict if the file doesn't exist yet (first-ever run),
    rather than raising, per Issue 8 criterion 5.
    """
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_hash_store(hashes: dict[str, str], path: Path) -> None:
    """Write `hashes` to `path` as JSON, creating parent directories if needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(hashes), encoding="utf-8")
