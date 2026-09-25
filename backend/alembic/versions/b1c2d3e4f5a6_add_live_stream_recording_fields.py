"""add_live_stream_recording_fields

Revision ID: b1c2d3e4f5a6
Revises: u1v2w3x4y5z6
Create Date: 2026-08-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5a6"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "content_live_streams",
        sa.Column("recording_status", sa.String(20), nullable=False, server_default="idle"),
    )
    op.add_column(
        "content_live_streams",
        sa.Column("recording_filename", sa.String(500), nullable=True),
    )
    op.add_column(
        "content_live_streams",
        sa.Column("recording_s3_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "content_live_streams",
        sa.Column("recording_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "content_live_streams",
        sa.Column("recording_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "content_live_streams",
        sa.Column("recording_completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("content_live_streams", "recording_completed_at")
    op.drop_column("content_live_streams", "recording_started_at")
    op.drop_column("content_live_streams", "recording_url")
    op.drop_column("content_live_streams", "recording_s3_key")
    op.drop_column("content_live_streams", "recording_filename")
    op.drop_column("content_live_streams", "recording_status")
