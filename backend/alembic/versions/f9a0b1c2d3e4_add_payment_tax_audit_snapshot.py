"""Add applied tax snapshots to end-user payments.

Revision ID: f9a0b1c2d3e4
Revises: e6f7a8b9c0d1
Create Date: 2026-09-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "f9a0b1c2d3e4"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column(
            "tax_amount",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column("payments", sa.Column("tax_snapshot", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "tax_snapshot")
    op.drop_column("payments", "tax_amount")