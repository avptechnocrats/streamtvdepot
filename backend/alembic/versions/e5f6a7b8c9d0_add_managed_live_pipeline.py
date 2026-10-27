"""add managed live pipeline state and ad breaks

Revision ID: e5f6a7b8c9d0
Revises: a6b7c8d9e0f1
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e5f6a7b8c9d0"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The app's startup create_all() may already have created the new table, so every step is idempotent.
    op.execute(
        "ALTER TABLE content_live_streams "
        "ADD COLUMN IF NOT EXISTS aws_live JSONB NOT NULL DEFAULT '{}'::jsonb"
    )
    op.execute("ALTER TABLE content_live_streams ADD COLUMN IF NOT EXISTS vod_video_id UUID")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_live_streams_vod_video_id'
            ) THEN
                ALTER TABLE content_live_streams
                ADD CONSTRAINT fk_content_live_streams_vod_video_id
                FOREIGN KEY (vod_video_id) REFERENCES content_videos (id) ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )

    if not sa.inspect(op.get_bind()).has_table("content_live_ad_breaks"):
        op.create_table(
            "content_live_ad_breaks",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "live_stream_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("content_live_streams.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("duration_seconds", sa.Integer(), nullable=False),
            sa.Column("splice_event_id", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="requested"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    op.execute("CREATE INDEX IF NOT EXISTS ix_content_live_ad_breaks_client_id ON content_live_ad_breaks (client_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_content_live_ad_breaks_live_stream_id ON content_live_ad_breaks (live_stream_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS content_live_ad_breaks")
    op.execute("ALTER TABLE content_live_streams DROP CONSTRAINT IF EXISTS fk_content_live_streams_vod_video_id")
    op.execute("ALTER TABLE content_live_streams DROP COLUMN IF EXISTS vod_video_id")
    op.execute("ALTER TABLE content_live_streams DROP COLUMN IF EXISTS aws_live")
