"""Add index for due end-user subscription renewal dispatch.

Revision ID: d9e0f1a2b3c4
Revises: c1d2e3f4a5b6
Create Date: 2026-09-15
"""

from alembic import op
import sqlalchemy as sa


revision = "d9e0f1a2b3c4"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_user_subscriptions_renewal_candidates",
        "user_subscriptions",
        ["expires_at"],
        unique=False,
        postgresql_where=sa.text("auto_renew IS TRUE AND status IN ('active', 'trial')"),
    )


def downgrade() -> None:
    op.drop_index("ix_user_subscriptions_renewal_candidates", table_name="user_subscriptions")