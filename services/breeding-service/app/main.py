from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.observability import install_observability
from app.routers import breed, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="breeding-service", version="0.1.0", lifespan=lifespan)
    install_observability(app)
    app.include_router(health.router)
    app.include_router(breed.router)
    return app


app = create_app()
