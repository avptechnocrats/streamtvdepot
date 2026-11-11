"""Add tenant tag catalogs and tags on content items."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "o0p1q2r3s4t5"
down_revision = "n9o0p1q2r3s4"
branch_labels = None
depends_on = None

CONTENT_TABLES = ("content_videos", "content_audio", "content_series", "content_live_streams", "content_ppv_events")


def upgrade() -> None:
    op.create_table(
        "content_tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("normalized_name", sa.String(240), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("client_id", "normalized_name", name="uq_content_tags_client_name"),
    )
    op.create_index("ix_content_tags_client_id", "content_tags", ["client_id"])
    for table in CONTENT_TABLES:
        op.add_column(table, sa.Column("tags", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))


def downgrade() -> None:
    for table in reversed(CONTENT_TABLES):
        op.drop_column(table, "tags")
    op.drop_index("ix_content_tags_client_id", table_name="content_tags")
    op.drop_table("content_tags")