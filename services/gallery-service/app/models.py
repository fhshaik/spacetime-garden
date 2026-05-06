"""
ORM mirror of the tables this service touches. genome-service owns the
schema (Alembic migrations live there); we mirror the columns we need.
Don't `metadata.create_all()` from this service — keep migration
authority single.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Genome(Base):
    __tablename__ = "genomes"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    spec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    view: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    phenotype: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    owner: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class GalleryLike(Base):
    __tablename__ = "gallery_likes"

    genome_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("genomes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    liker_ip: Mapped[str] = mapped_column(INET, primary_key=True)
    liked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
