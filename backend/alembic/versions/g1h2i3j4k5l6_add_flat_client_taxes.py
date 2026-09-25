"""Add flat-fee support to tenant taxes.

Revision ID: g1h2i3j4k5l6
Revises: f9a0b1c2d3e4
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa


revision = "g1h2i3j4k5l6"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_taxes",
        sa.Column("tax_type", sa.String(length=20), nullable=False, server_default="percentage"),
    )
    op.add_column(
        "client_taxes",
        sa.Column("flat_amount", sa.Numeric(precision=10, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_taxes", "flat_amount")
    op.drop_column("client_taxes", "tax_type")