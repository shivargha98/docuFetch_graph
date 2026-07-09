"""
FastAPI application entry point. Instantiates the `app` object all routers
are mounted onto: graph read (Issue 16), folder configuration (Issue 15),
and WebSocket traversal streaming (Issue 14).
"""
from fastapi import FastAPI

from backend.api.browse_routes import router as browse_router
from backend.api.config_routes import router as config_router
from backend.api.graph_routes import router as graph_router
from backend.api.upload_routes import router as upload_router
from backend.api.ws_routes import router as ws_router

app = FastAPI()
app.include_router(browse_router)
app.include_router(graph_router)
app.include_router(config_router)
app.include_router(ws_router)
app.include_router(upload_router)
