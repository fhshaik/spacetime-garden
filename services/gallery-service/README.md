# gallery-service

Public read-heavy gallery + likes. Reads from the same Postgres as
genome-service, writes only to the `gallery_likes` table. In-process
LRU cache (60s TTL) on the gallery list endpoint demonstrates a
visibly-different scaling profile vs. genome-service in Grafana.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`   | `/gallery`                    | Top-N genomes by like count. `?limit=20` (default), `?offset=0`. |
| `POST`  | `/gallery/{genome_id}/like`   | Add a like. Idempotent per (genome_id, liker_ip). Returns `{like_count}`. |
| `GET`   | `/healthz`                    | Liveness. |
| `GET`   | `/readyz`                     | Readiness — DB ping. |
| `GET`   | `/metrics`                    | Prometheus exposition. |

## Schema ownership

This service does **not** own any schema. The `gallery_likes` table is
created by genome-service's Alembic migration 0002 (single migration owner
across all services to avoid version-graph collisions).

## Local dev

```sh
uv sync
DATABASE_URL=postgresql+asyncpg://garden:garden@localhost:5432/garden \
  uv run uvicorn app.main:app --reload --port 8003
```
