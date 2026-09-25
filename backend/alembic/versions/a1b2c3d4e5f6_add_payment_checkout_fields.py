"""Add paypal to paymentmethod enum; add content_id and payment_id to user_subscriptions

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-04-30

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# ── Revision identifiers ──────────────────────────────────────────────────────

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add 'paypal' to the paymentmethod enum.
    # ALTER TYPE … ADD VALUE cannot run inside a transaction block in older Postgres,
    # so we use COMMIT + SET to work around that if needed.
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'paypal'")

    # Add content_id (nullable UUID) to track PPV/Rental content access
    op.add_column(
        "user_subscriptions",
        sa.Column("content_id", UUID(as_uuid=True), nullable=True),
    )

    # Add payment_id FK (nullable) — back-reference to the payment that funded this record
    op.add_column(
        "user_subscriptions",
        sa.Column(
            "payment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("payments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_user_subscriptions_payment_id",
        "user_subscriptions",
        ["payment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_user_subscriptions_payment_id", table_name="user_subscriptions")
    op.drop_column("user_subscriptions", "payment_id")
    op.drop_column("user_subscriptions", "content_id")
    # NOTE: Postgres does not support removing enum values.
    # The 'paypal' value added to paymentmethod cannot be automatically reversed.
