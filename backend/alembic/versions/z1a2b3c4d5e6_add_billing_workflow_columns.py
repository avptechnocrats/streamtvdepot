"""add_billing_workflow_columns

Adds pending downgrade scheduling, grace-period tracking, renewal reminder
deduplication, Stripe Customer ID and PayPal Vault ID for off-session auto-charge.

Revision ID: z1a2b3c4d5e6
Revises: a5b6c7d8e9f0
Create Date: 2026-08-13 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "z1a2b3c4d5e6"
down_revision: Union[str, None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_subscriptions",
        sa.Column(
            "pending_downgrade_plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("saas_subscription_plans.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "client_subscriptions",
        sa.Column("pending_downgrade_requested_at", sa.String(50), nullable=True),
    )
    op.add_column(
        "client_subscriptions",
        sa.Column("grace_period_ends_at", sa.String(50), nullable=True),
    )
    op.add_column(
        "client_subscriptions",
        sa.Column("reminder_sent_days", sa.String(50), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("stripe_customer_id", sa.String(100), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("paypal_vault_id", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clients", "paypal_vault_id")
    op.drop_column("clients", "stripe_customer_id")
    op.drop_column("client_subscriptions", "reminder_sent_days")
    op.drop_column("client_subscriptions", "grace_period_ends_at")
    op.drop_column("client_subscriptions", "pending_downgrade_requested_at")
    op.drop_column("client_subscriptions", "pending_downgrade_plan_id")
