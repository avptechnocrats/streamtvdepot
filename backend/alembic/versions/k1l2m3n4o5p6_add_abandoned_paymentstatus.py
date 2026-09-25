"""add abandoned value to paymentstatus enum

Revision ID: k1l2m3n4o5p6
Revises: j1k2l3m4n5o6
Create Date: 2026-05-08

"""
from alembic import op

revision: str = "k1l2m3n4o5p6"
down_revision: str = "j1k2l3m4n5o6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLAlchemy stores Python enum member *names* (uppercase) in PostgreSQL.
    # The existing values are PENDING, SUCCESS, FAILED, REFUNDED — so the new
    # value must also be uppercase: ABANDONED.
    op.execute("ALTER TYPE paymentstatus ADD VALUE IF NOT EXISTS 'ABANDONED'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is a no-op.
    # To fully roll back, recreate the enum without 'abandoned' and
    # cast the column — this is rarely needed in practice.
    pass
