"""add_ppv_rtmp_key

Revision ID: z7a8b9c0d1e2
Revises: c8d9e0f1a2b3
Create Date: 2026-09-13 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "z7a8b9c0d1e2"
down_revision: Union[str, None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("content_ppv_events", sa.Column("rtmp_key", sa.String(length=255), nullable=True))
    op.create_index("ix_content_ppv_events_rtmp_key", "content_ppv_events", ["rtmp_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_content_ppv_events_rtmp_key", table_name="content_ppv_events")
    op.drop_column("content_ppv_events", "rtmp_key")