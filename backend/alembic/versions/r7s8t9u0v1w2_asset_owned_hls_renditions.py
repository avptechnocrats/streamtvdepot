"""Add asset-owned HLS renditions for reusable transcoding."""

from __future__ import annotations

import uuid
from typing import Sequence
from urllib.parse import unquote, urlparse

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "r7s8t9u0v1w2"
down_revision: str | None = "k6l7m8n9o0p1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_media_assets_client_s3_key",
        "media_assets",
        ["client_id", "s3_key"],
    )
    op.create_table(
        "media_asset_renditions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "media_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_s3_key", sa.Text(), nullable=False),
        sa.Column("profile", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("mediaconvert_job_id", sa.String(255), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column("hls_manifest_key", sa.Text(), nullable=True),
        sa.Column("hls_url", sa.Text(), nullable=True),
        sa.Column("drm_key_encrypted", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint(
            "client_id", "source_s3_key", "profile",
            name="uq_media_asset_rendition_source_profile",
        ),
    )
    op.create_index("ix_media_asset_renditions_client_id", "media_asset_renditions", ["client_id"])
    op.create_index("ix_media_asset_renditions_media_asset_id", "media_asset_renditions", ["media_asset_id"])
    op.create_index("ix_media_asset_renditions_mediaconvert_job_id", "media_asset_renditions", ["mediaconvert_job_id"])
    op.add_column(
        "transcode_jobs",
        sa.Column(
            "media_asset_rendition_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media_asset_renditions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "content_videos",
        sa.Column(
            "media_asset_rendition_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media_asset_renditions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_transcode_jobs_media_asset_rendition_id",
        "transcode_jobs",
        ["media_asset_rendition_id"],
    )
    op.create_index(
        "ix_content_videos_media_asset_rendition_id",
        "content_videos",
        ["media_asset_rendition_id"],
    )

    bind = op.get_bind()
    videos = bind.execute(sa.text("""
        SELECT id, client_id, video_url, transcode_job_id, transcode_progress,
               hls_manifest_key, hls_url, drm_key_encrypted, updated_at
        FROM content_videos
        WHERE video_url IS NOT NULL
          AND transcode_status = 'complete'
          AND hls_manifest_key IS NOT NULL
        ORDER BY updated_at DESC
    """)).mappings()
    asset_rows = bind.execute(sa.text("""
        SELECT id, client_id, s3_key FROM media_assets
    """)).mappings()
    assets_by_key: dict[tuple[uuid.UUID, str], uuid.UUID] = {}
    for asset in asset_rows:
        assets_by_key.setdefault((asset["client_id"], asset["s3_key"]), asset["id"])

    rendition_ids: dict[tuple[uuid.UUID, str, str], uuid.UUID] = {}
    video_rendition_ids: dict[uuid.UUID, tuple[uuid.UUID, str | None]] = {}
    rows: list[dict[str, object]] = []
    for video in videos:
        source_key = unquote(urlparse(video["video_url"]).path.lstrip("/"))
        if not source_key:
            continue
        profile = "abr_hls_v1_drm" if video["drm_key_encrypted"] else "abr_hls_v1_clear"
        key = (video["client_id"], source_key, profile)
        if key in rendition_ids:
            # Duplicates keep their own legacy manifest and DRM key, which differ from the shared rendition's.
            continue
        rendition_id = uuid.uuid4()
        rendition_ids[key] = rendition_id
        video_rendition_ids[video["id"]] = (rendition_id, video["transcode_job_id"])
        job_id = video["transcode_job_id"]
        rows.append({
            "id": rendition_id,
            "client_id": video["client_id"],
            "media_asset_id": assets_by_key.get((video["client_id"], source_key)),
            "source_s3_key": source_key,
            "profile": profile,
            "status": "complete",
            "mediaconvert_job_id": job_id if job_id and not job_id.startswith("error:") else None,
            "progress": video["transcode_progress"] or 100,
            "hls_manifest_key": video["hls_manifest_key"],
            "hls_url": video["hls_url"],
            "drm_key_encrypted": video["drm_key_encrypted"],
        })

    if rows:
        rendition_table = sa.table(
            "media_asset_renditions",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("client_id", postgresql.UUID(as_uuid=True)),
            sa.column("media_asset_id", postgresql.UUID(as_uuid=True)),
            sa.column("source_s3_key", sa.Text()),
            sa.column("profile", sa.String(100)),
            sa.column("status", sa.String(20)),
            sa.column("mediaconvert_job_id", sa.String(255)),
            sa.column("progress", sa.Integer()),
            sa.column("hls_manifest_key", sa.Text()),
            sa.column("hls_url", sa.Text()),
            sa.column("drm_key_encrypted", sa.Text()),
        )
        op.bulk_insert(rendition_table, rows)

    for video_id, (rendition_id, mediaconvert_job_id) in video_rendition_ids.items():
        if mediaconvert_job_id and not mediaconvert_job_id.startswith("error:"):
            bind.execute(
                sa.text("""
                    UPDATE transcode_jobs AS jobs
                    SET media_asset_rendition_id = :rendition_id
                    WHERE jobs.video_id = :video_id
                      AND jobs.mediaconvert_job_id = :mediaconvert_job_id
                """),
                {
                    "rendition_id": rendition_id,
                    "video_id": video_id,
                    "mediaconvert_job_id": mediaconvert_job_id,
                },
            )
        bind.execute(
            sa.text("""
                UPDATE content_videos AS videos
                SET media_asset_rendition_id = :rendition_id
                WHERE videos.id = :video_id
            """),
            {"rendition_id": rendition_id, "video_id": video_id},
        )


def downgrade() -> None:
    op.drop_index("ix_content_videos_media_asset_rendition_id", table_name="content_videos")
    op.drop_column("content_videos", "media_asset_rendition_id")
    op.drop_index("ix_transcode_jobs_media_asset_rendition_id", table_name="transcode_jobs")
    op.drop_column("transcode_jobs", "media_asset_rendition_id")
    op.drop_index("ix_media_asset_renditions_mediaconvert_job_id", table_name="media_asset_renditions")
    op.drop_index("ix_media_asset_renditions_media_asset_id", table_name="media_asset_renditions")
    op.drop_index("ix_media_asset_renditions_client_id", table_name="media_asset_renditions")
    op.drop_table("media_asset_renditions")
    op.drop_index("ix_media_assets_client_s3_key", table_name="media_assets")