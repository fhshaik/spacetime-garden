"""
Smoke tests that don't require a live Postgres. Integration tests for the
CRUD routes run via docker-compose against a real Postgres — see the root
Makefile's `test-integration` target.
"""

from fastapi.testclient import TestClient

from app.main import app


def test_healthz_returns_ok() -> None:
    with TestClient(app) as client:
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_metrics_endpoint_exposed() -> None:
    with TestClient(app) as client:
        response = client.get("/metrics")
        assert response.status_code == 200
        # Prometheus exposition format starts with comments and metric names.
        assert b"# HELP" in response.content or b"# TYPE" in response.content


def test_openapi_schema_includes_genomes_route() -> None:
    with TestClient(app) as client:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        paths = response.json()["paths"]
        assert "/genomes" in paths
        assert "/genomes/{genome_id}" in paths
