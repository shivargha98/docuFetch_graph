"""
FastAPI application entry point. Instantiates the `app` object that later
rounds' routers (graph read, folder config, websocket) will be mounted onto.
Round 2 mounts the graph read router (Issue 16); folder-config and websocket
routers still remain for later rounds.
"""
from fastapi import FastAPI

from backend.api.graph_routes import router as graph_router

app = FastAPI()
app.include_router(graph_router)
