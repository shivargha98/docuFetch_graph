"""
FastAPI application entry point. Instantiates the `app` object that later
rounds' routers (graph read, folder config, websocket) will be mounted onto.
No routes are defined yet - Issue 1 only needs `app` to exist as a clean,
importable module-level object.
"""
from fastapi import FastAPI

app = FastAPI()
