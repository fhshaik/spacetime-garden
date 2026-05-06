import os

# Engine is lazy — no connection opens on import. Tests that don't hit the
# DB (smoke + cache unit tests) are fine; integration tests run against a
# real Postgres via docker-compose.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
