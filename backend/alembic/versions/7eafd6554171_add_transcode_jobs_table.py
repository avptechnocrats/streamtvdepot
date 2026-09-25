"""add_transcode_jobs_table

Revision ID: 7eafd6554171
Revises: f3a1b2c4d5e6
Create Date: 2026-04-15 13:53:09.967038

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7eafd6554171'
down_revision: Union[str, None] = 'f3a1b2c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS guard: safe to re-run if the table was created out-of-band
    bind = op.get_bind()
    if bind.dialect.has_table(bind, "transcode_jobs"):
        return

    op.create_table(
        "transcode_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("video_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("content_videos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mediaconvert_job_id", sa.String(255), nullable=True),
        sa.Column("mediaconvert_queue", sa.String(500), nullable=True),
        sa.Column("input_s3_key", sa.Text, nullable=True),
        sa.Column("output_s3_prefix", sa.Text, nullable=True),
        sa.Column("hls_url", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("progress", sa.Integer, nullable=True),
        sa.Column("drm_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_transcode_jobs_client_id", "transcode_jobs", ["client_id"])
    op.create_index("ix_transcode_jobs_video_id", "transcode_jobs", ["video_id"])
    op.create_index("ix_transcode_jobs_status", "transcode_jobs", ["status"])
    op.create_index("ix_transcode_jobs_mediaconvert_job_id",
                    "transcode_jobs", ["mediaconvert_job_id"])


def downgrade() -> None:
    op.drop_index("ix_transcode_jobs_mediaconvert_job_id", "transcode_jobs")
    op.drop_index("ix_transcode_jobs_status", "transcode_jobs")
    op.drop_index("ix_transcode_jobs_video_id", "transcode_jobs")
    op.drop_index("ix_transcode_jobs_client_id", "transcode_jobs")
    op.drop_table("transcode_jobs")
