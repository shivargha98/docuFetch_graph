"""
Drag-and-drop folder upload API (POST /api/ingest/upload). The browser can
read a dropped folder's files but never its absolute path, so the frontend
uploads the files here; they're saved under UPLOADS_PATH/<folder_name>/
(replacing any previous copy of that folder name) and the shared
folder-switch logic then purges old state and ingests the saved copy. The
live watcher watches the copy — re-dropping the folder is how it refreshes.
"""
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.api.config_routes import switch_to_folder
from backend.config import UPLOADS_PATH

router = APIRouter()

SUPPORTED_SUFFIXES = {".md", ".txt", ".pdf"}


@router.post("/api/ingest/upload")
def upload_folder(folder_name: str = Form(...), files: list[UploadFile] = File(...)) -> dict:
    """
    Save the uploaded files (multipart parts whose filenames are
    folder-relative paths) under UPLOADS_PATH/<folder_name>/, keeping only
    supported types (.md/.txt/.pdf), then run the shared folder-switch to
    ingest the copy. Rejects invalid folder names (empty, containing path
    separators, or escaping UPLOADS_PATH), path-traversal filenames, and
    uploads with no supported files (422 in all cases, nothing switched).
    """
    if not files:
        raise HTTPException(status_code=422, detail="No files uploaded")

    uploads_root = Path(UPLOADS_PATH).resolve()
    dest_root = (uploads_root / folder_name).resolve()
    if (
        not folder_name
        or "/" in folder_name
        or "\\" in folder_name
        or dest_root == uploads_root
        or not dest_root.is_relative_to(uploads_root)
    ):
        raise HTTPException(status_code=422, detail=f"Invalid folder name: {folder_name}")

    saved = []
    for upload in files:
        relative = upload.filename or ""
        if Path(relative).suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        target = (dest_root / relative).resolve()
        if not target.is_relative_to(dest_root):
            raise HTTPException(status_code=422, detail=f"Invalid file path: {relative}")
        saved.append((target, upload))

    if not saved:
        raise HTTPException(status_code=422, detail="No supported files (.md/.txt/.pdf) in upload")

    if dest_root.exists():
        shutil.rmtree(dest_root)
    for target, upload in saved:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(upload.file.read())
        upload.file.close()

    switch_to_folder(dest_root)
    return {"path": str(dest_root), "status": "watching", "mode": "uploaded"}
