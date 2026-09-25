"""add SaaS subscription billing cycle

Revision ID: c1d2e3f4a5b6
Revises: z8b9c0d1e2f3
Create Date: 2026-09-14
"""

import sqlalchemy as sa
from alembic import op


revision = "c1d2e3f4a5b6"
down_revision = "z8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_subscriptions",
        sa.Column("billing_cycle", sa.String(20), nullable=False, server_default="monthly"),
    )
    op.alter_column("client_subscriptions", "billing_cycle", server_default=None)


def downgrade() -> None:
    op.drop_column("client_subscriptions", "billing_cycle")