"""Add tenant taxation configuration.

Revision ID: d0e1f2a3b4c5
Revises: c0d1e2f3a4b5
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d0e1f2a3b4c5"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_taxes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("percentage", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("client_id", "name", name="uq_client_taxes_client_name"),
    )
    op.create_index("ix_client_taxes_client_id", "client_taxes", ["client_id"])


def downgrade() -> None:
    op.drop_index("ix_client_taxes_client_id", table_name="client_taxes")
    op.drop_table("client_taxes")