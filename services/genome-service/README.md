# genome-service

CRUD for persisted black hole genomes. Owns the `genomes` table on Postgres.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST`   | `/genomes`        | Create. Body: `{name, spec, view, phenotype}`. Returns `{id, ...}` (server-generated UUID). |
| `GET`    | `/genomes`        | List (paginated). |
| `GET`    | `/genomes/{id}`   | Read one. |
| `DELETE` | `/genomes/{id}`   | Delete. |
| `GET`    | `/healthz`        | Liveness — 200 if process is alive. |
| `GET`    | `/readyz`         | Readiness — 200 only if DB reachable (`SELECT 1`). |
| `GET`    | `/metrics`        | Prometheus exposition. |

`/healthz` and `/readyz` are split intentionally: a transient RDS blip should not crashloop pods.

## Local dev

```sh
uv sync
DATABASE_URL=postgresql+asyncpg://garden:garden@localhost:5432/garden \
  uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8001
```

## Migrations

Alembic owns the schema for *all* services (single migration graph). Generate a new revision:

```sh
uv run alembic revision -m "add foo column" --autogenerate
```
