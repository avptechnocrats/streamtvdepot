"""Add cashfree to the paymentmethod enum.

Revision ID: b7c8d9e0f1a2
Revises: 9a8b7c6d5e4f
"""

from alembic import op

revision = "b7c8d9e0f1a2"
down_revision = "9a8b7c6d5e4f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'cashfree'")


def downgrade() -> None:
    # PostgreSQL cannot remove enum values without rebuilding the type.
    pass