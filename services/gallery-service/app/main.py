from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import engine
from app.observability import install_observability
from app.routers import gallery, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title="gallery-service", version="0.1.0", lifespan=lifespan)
    install_observability(app)
    app.include_router(health.router)
    app.include_router(gallery.router)
    return app


app = create_app()
