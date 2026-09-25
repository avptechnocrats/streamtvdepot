"""align_ppv_events_with_admin_form

Revision ID: z2a3b4c5d6e7
Revises: z1a2b3c4d5e6
Create Date: 2026-08-16 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "z2a3b4c5d6e7"
down_revision: Union[str, None] = "z1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("content_ppv_events", sa.Column("slug", sa.String(length=255), nullable=True))
    op.create_index("ix_content_ppv_events_slug", "content_ppv_events", ["slug"], unique=False)
    op.add_column("content_ppv_events", sa.Column("category", sa.String(length=255), nullable=True))
    op.add_column(
        "content_ppv_events",
        sa.Column("source", sa.String(length=20), nullable=False, server_default="rtmp"),
    )
    op.add_column(
        "content_ppv_events",
        sa.Column(
            "thumbnails",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "content_ppv_events",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("content_ppv_events", "price", existing_type=sa.Numeric(10, 2), nullable=True)


def downgrade() -> None:
    op.alter_column("content_ppv_events", "price", existing_type=sa.Numeric(10, 2), nullable=False)
    op.drop_column("content_ppv_events", "is_active")
    op.drop_column("content_ppv_events", "thumbnails")
    op.drop_column("content_ppv_events", "source")
    op.drop_column("content_ppv_events", "category")
    op.drop_index("ix_content_ppv_events_slug", table_name="content_ppv_events")
    op.drop_column("content_ppv_events", "slug")