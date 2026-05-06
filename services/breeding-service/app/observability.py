"""Same shape as genome-service/app/observability.py — duplicated by design."""

import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from prometheus_client import Counter, Histogram, make_asgi_app
from pythonjsonlogger.json import JsonFormatter

from app.settings import settings

REQUEST_COUNT = Counter(
    "http_requests_total",
    "HTTP requests by method, path template, status",
    ["method", "path", "status"],
)
REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds, by method and path template",
    ["method", "path"],
)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level"},
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)


def _path_template(request: Request) -> str:
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    if isinstance(template, str):
        return template
    return request.url.path


async def request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id

    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    path = _path_template(request)
    REQUEST_COUNT.labels(request.method, path, response.status_code).inc()
    REQUEST_DURATION.labels(request.method, path).observe(duration)

    response.headers["x-request-id"] = request_id
    response.headers["x-response-time-ms"] = f"{duration * 1000:.2f}"

    logging.getLogger("http").info(
        "request",
        extra={
            "service": settings.service_name,
            "request_id": request_id,
            "method": request.method,
            "path": path,
            "status": response.status_code,
            "duration_ms": round(duration * 1000, 2),
        },
    )
    return response


def install_observability(app: FastAPI) -> None:
    configure_logging()
    app.middleware("http")(request_id_middleware)
    app.mount("/metrics", make_asgi_app())
