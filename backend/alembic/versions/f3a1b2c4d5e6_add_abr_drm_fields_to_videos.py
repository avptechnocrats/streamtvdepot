"""Add ABR and DRM fields to content_videos

Revision ID: f3a1b2c4d5e6
Revises: a4c8e1f23b90
Create Date: 2026-04-15

Adds to content_videos:
  transcode_status     VARCHAR(20)   – pending | processing | complete | failed
  transcode_job_id     VARCHAR(255)  – AWS MediaConvert job ID
  transcode_progress   INTEGER       – 0-100 percent complete
  hls_manifest_key     TEXT          – S3 key of the master HLS playlist
  hls_url              TEXT          – CDN / S3 playback URL for the player
  drm_key_encrypted    TEXT          – Fernet-encrypted AES-128 key (NULL = no DRM)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# ── Revision identifiers ──────────────────────────────────────────────────────

revision: str = "f3a1b2c4d5e6"
down_revision: str | None = "00f1ef7fa96f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("content_videos", sa.Column("transcode_status",   sa.String(20),  nullable=True))
    op.add_column("content_videos", sa.Column("transcode_job_id",   sa.String(255), nullable=True))
    op.add_column("content_videos", sa.Column("transcode_progress", sa.Integer(),   nullable=True))
    op.add_column("content_videos", sa.Column("hls_manifest_key",   sa.Text(),      nullable=True))
    op.add_column("content_videos", sa.Column("hls_url",            sa.Text(),      nullable=True))
    op.add_column("content_videos", sa.Column("drm_key_encrypted",  sa.Text(),      nullable=True))

    # Index for looking up videos by transcode_status (admin dashboard polling)
    op.create_index(
        "ix_content_videos_transcode_status",
        "content_videos",
        ["transcode_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_content_videos_transcode_status", table_name="content_videos")
    op.drop_column("content_videos", "drm_key_encrypted")
    op.drop_column("content_videos", "hls_url")
    op.drop_column("content_videos", "hls_manifest_key")
    op.drop_column("content_videos", "transcode_progress")
    op.drop_column("content_videos", "transcode_job_id")
    op.drop_column("content_videos", "transcode_status")
