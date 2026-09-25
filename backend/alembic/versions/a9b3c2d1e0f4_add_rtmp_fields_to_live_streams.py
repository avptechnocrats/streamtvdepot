"""add_rtmp_fields_to_live_streams

Revision ID: a9b3c2d1e0f4
Revises: d3c8a1f72e04
Create Date: 2026-04-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a9b3c2d1e0f4'
down_revision = '7eafd6554171'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("content_live_streams",
        sa.Column("rtmp_key", sa.String(255), nullable=True))
    op.add_column("content_live_streams",
        sa.Column("stream_status", sa.String(20), nullable=False,
                  server_default="idle"))

    op.create_index(
        "ix_content_live_streams_rtmp_key",
        "content_live_streams", ["rtmp_key"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_content_live_streams_rtmp_key",
                  table_name="content_live_streams")
    op.drop_column("content_live_streams", "stream_status")
    op.drop_column("content_live_streams", "rtmp_key")
