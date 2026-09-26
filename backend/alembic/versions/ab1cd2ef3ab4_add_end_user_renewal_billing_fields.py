"""add_end_user_renewal_billing_fields

Adds Stripe Customer ID / PayPal Vault ID to end_users (off-session
auto-renewal charging), and grace-period/reminder tracking columns plus a
PAST_DUE status to user_subscriptions, mirroring the existing client-level
(KalingoTV -> StreamTVDepot) billing workflow for end-user (Pankaj/Vishal/... ->
KalingoTV) subscription renewals.

Revision ID: ab1cd2ef3ab4
Revises: w5x6y7z8a9b
Create Date: 2026-09-03 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ab1cd2ef3ab4"
down_revision: Union[str, None] = "w5x6y7z8a9b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "end_users",
        sa.Column("stripe_customer_id", sa.String(100), nullable=True),
    )
    op.add_column(
        "end_users",
        sa.Column("paypal_vault_id", sa.String(100), nullable=True),
    )
    op.add_column(
        "user_subscriptions",
        sa.Column("grace_period_ends_at", sa.String(50), nullable=True),
    )
    op.add_column(
        "user_subscriptions",
        sa.Column("reminder_sent_days", sa.String(50), nullable=True),
    )
    # SQLAlchemy stores Python enum member *names* (uppercase) in PostgreSQL
    # for SubscriptionStatus (no values_callable), matching ACTIVE/EXPIRED/etc.
    op.execute("ALTER TYPE subscriptionstatus ADD VALUE IF NOT EXISTS 'PAST_DUE'")


def downgrade() -> None:
    op.drop_column("user_subscriptions", "reminder_sent_days")
    op.drop_column("user_subscriptions", "grace_period_ends_at")
    op.drop_column("end_users", "paypal_vault_id")
    op.drop_column("end_users", "stripe_customer_id")
    # PostgreSQL does not support removing enum values; downgrade is a no-op
    # for the PAST_DUE value.
