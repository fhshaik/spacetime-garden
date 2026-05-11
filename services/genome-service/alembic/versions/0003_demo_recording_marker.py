"""add demo recording marker column

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-11

Demo-only schema change committed during the recorded demo of the
Argo CD PreSync migration hook. Adds a nullable string column to the
genomes table with a server_default; existing rows backfill on apply.
Safe to roll forward and back; no app code reads this column.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "genomes",
        sa.Column(
            "demo_recording_marker",
            sa.String(length=50),
            nullable=True,
            server_default="recorded-2026-05-11",
        ),
    )


def downgrade() -> None:
    op.drop_column("genomes", "demo_recording_marker")
