"""add_country_pricing_to_client_plans

Revision ID: e2c5f9a1b047
Revises: 3e1a7f8c2d05
Create Date: 2026-04-13 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e2c5f9a1b047"
down_revision: Union[str, None] = "3e1a7f8c2d05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Access-time restrictions
    op.add_column(
        "client_subscription_plans",
        sa.Column("restriction_months", sa.Integer(), nullable=True),
    )
    op.add_column(
        "client_subscription_plans",
        sa.Column("restriction_hours_per_day", sa.Integer(), nullable=True),
    )
    op.add_column(
        "client_subscription_plans",
        sa.Column("restriction_days", sa.Integer(), nullable=True),
    )
    # Per-country price overrides: [{country, price, currency}, ...]
    op.add_column(
        "client_subscription_plans",
        sa.Column("country_pricing", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_subscription_plans", "country_pricing")
    op.drop_column("client_subscription_plans", "restriction_days")
    op.drop_column("client_subscription_plans", "restriction_hours_per_day")
    op.drop_column("client_subscription_plans", "restriction_months")
