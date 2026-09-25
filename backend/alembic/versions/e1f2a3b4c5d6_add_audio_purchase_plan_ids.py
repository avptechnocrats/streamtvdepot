"""Add purchasable plan configuration to audio content.

Revision ID: e1f2a3b4c5d6
Revises: d9e0f1a2b3c4
Create Date: 2026-09-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e1f2a3b4c5d6"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "content_audio",
        sa.Column(
            "subscription_plan_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.alter_column("content_audio", "subscription_plan_ids", server_default=None)


def downgrade() -> None:
    op.drop_column("content_audio", "subscription_plan_ids")