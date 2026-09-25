"""add_trial_and_applies_to_fields_single_migration

Revision ID: y3z4a5b6c7d8
Revises: b1c2d3e4f5a6
Create Date: 2026-08-11 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "y3z4a5b6c7d8"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_subscription_plans",
        sa.Column(
            "trial_requires_active_payment_method",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "client_subscription_plans",
        sa.Column("applies_to_all_content", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "client_subscription_plans",
        sa.Column("applies_to_scope", sa.String(length=30), nullable=False, server_default=sa.text("'content'")),
    )
    op.add_column(
        "client_subscription_plans",
        sa.Column("applies_to_content_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "client_subscription_plans",
        sa.Column("applies_to_category_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_subscription_plans", "applies_to_category_ids")
    op.drop_column("client_subscription_plans", "applies_to_content_ids")
    op.drop_column("client_subscription_plans", "applies_to_scope")
    op.drop_column("client_subscription_plans", "applies_to_all_content")
    op.drop_column("client_subscription_plans", "trial_requires_active_payment_method")