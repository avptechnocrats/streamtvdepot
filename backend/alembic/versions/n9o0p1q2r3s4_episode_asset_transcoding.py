"""Link episodes to reusable HLS renditions and allow asset-owned transcode jobs."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "n9o0p1q2r3s4"
down_revision = "m8n9o0p1q2r3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("content_episodes", sa.Column("media_asset_rendition_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_episode_media_rendition", "content_episodes", "media_asset_renditions", ["media_asset_rendition_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_content_episodes_media_asset_rendition_id", "content_episodes", ["media_asset_rendition_id"])
    op.alter_column("transcode_jobs", "video_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.execute("""
        UPDATE content_episodes AS episode
        SET media_asset_rendition_id = rendition.id
        FROM media_asset_renditions AS rendition
        WHERE rendition.client_id = episode.client_id
          AND rendition.profile = 'abr_hls_v1_clear'
          AND rendition.source_s3_key = regexp_replace(split_part(episode.video_url, '?', 1), '^https?://[^/]+/', '')
    """)


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT 1 FROM transcode_jobs WHERE video_id IS NULL LIMIT 1")).first():
        raise RuntimeError("Archive asset-owned transcode jobs before downgrading; their audit history will not be deleted automatically")
    op.alter_column("transcode_jobs", "video_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_index("ix_content_episodes_media_asset_rendition_id", table_name="content_episodes")
    op.drop_constraint("fk_episode_media_rendition", "content_episodes", type_="foreignkey")
    op.drop_column("content_episodes", "media_asset_rendition_id")