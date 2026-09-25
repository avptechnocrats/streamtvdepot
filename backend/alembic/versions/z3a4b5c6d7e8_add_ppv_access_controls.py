"""add_ppv_access_controls

Revision ID: z3a4b5c6d7e8
Revises: z2a3b4c5d6e7
Create Date: 2026-08-16 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "z3a4b5c6d7e8"
down_revision: Union[str, None] = "z2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_ppv_events",
        sa.Column("geo_fencing", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{\"blocked_countries\": []}'::jsonb")),
    )
    op.add_column(
        "content_ppv_events",
        sa.Column("pricing_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("client_subscription_plans.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("content_ppv_events", "pricing_plan_id")
    op.drop_column("content_ppv_events", "geo_fencing")