"""
Server-side directory browsing API. Powers the frontend's folder-browser
modal: lists a directory's immediate subdirectories (files excluded,
unreadable entries skipped) with parent navigation and, on Windows, the
available drive roots — the backend can see real absolute paths where the
browser sandbox cannot.
"""
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/api/browse")
def browse(path: str | None = None) -> dict:
    """
    List the immediate subdirectories of `path` (defaulting to the user's
    home directory) as {"name", "path"} entries sorted by name. Includes the
    parent path (null at a filesystem root) and, when the platform supports
    os.listdrives (Windows, Python 3.12+), the list of drive roots. Entries
    that raise OSError (permissions, broken mounts) are skipped. A missing
    or non-directory path returns 422.
    """
    base = Path(path) if path else Path.home()
    if not base.exists() or not base.is_dir():
        raise HTTPException(status_code=422, detail="Path does not exist or is not a directory")

    dirs = []
    try:
        entries = sorted(base.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        raise HTTPException(status_code=422, detail="Directory is not readable")
    for entry in entries:
        try:
            if entry.is_dir():
                dirs.append({"name": entry.name, "path": str(entry)})
        except OSError:
            continue

    parent = None if base.parent == base else str(base.parent)
    drives = list(os.listdrives()) if hasattr(os, "listdrives") else None
    return {"path": str(base), "parent": parent, "drives": drives, "dirs": dirs}
