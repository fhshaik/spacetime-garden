"""add gallery_likes table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-05

Owned by genome-service so the project has a single migration graph,
even though the table is consumed by gallery-service. This keeps Alembic
version state coherent across services connecting to the same database.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "gallery_likes",
        sa.Column(
            "genome_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("genomes.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("liker_ip", postgresql.INET(), primary_key=True, nullable=False),
        sa.Column(
            "liked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("gallery_likes_genome_idx", "gallery_likes", ["genome_id"])


def downgrade() -> None:
    op.drop_index("gallery_likes_genome_idx", table_name="gallery_likes")
    op.drop_table("gallery_likes")
