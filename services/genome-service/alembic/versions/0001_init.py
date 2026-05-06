"""init genomes table

Revision ID: 0001
Revises:
Create Date: 2026-05-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "genomes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("spec", postgresql.JSONB(), nullable=False),
        sa.Column("view", postgresql.JSONB(), nullable=False),
        sa.Column("phenotype", postgresql.JSONB(), nullable=False),
        sa.Column("owner", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("genomes_created_at_idx", "genomes", [sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_index("genomes_created_at_idx", table_name="genomes")
    op.drop_table("genomes")
