import os

# Set DATABASE_URL before any app imports so pydantic-settings validates.
# The engine itself is lazy — no connection is opened on import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
