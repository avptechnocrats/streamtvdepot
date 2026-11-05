"""Add series metadata, publishing settings, and episode numbering constraints."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m8n9o0p1q2r3"
down_revision = "l7m8n9o0p1q2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("languages", "thumbnails", "geo_fencing"):
        default = "[]" if name == "languages" else "{}"
        op.add_column("content_series", sa.Column(name, postgresql.JSONB(), nullable=False, server_default=sa.text(f"'{default}'::jsonb")))
    op.execute("UPDATE content_series SET languages = jsonb_build_array(language) WHERE language IS NOT NULL AND language <> ''")
    for name, length in (("content_classification", 100), ("age_rating", 20), ("trailer_type", 20)):
        op.add_column("content_series", sa.Column(name, sa.String(length), nullable=True))
    op.add_column("content_series", sa.Column("rating", sa.Float(), nullable=True))
    op.add_column("content_series", sa.Column("publish_option", sa.String(10), nullable=False, server_default="now"))
    op.add_column("content_series", sa.Column("publish_at", sa.DateTime(timezone=True), nullable=True))
    for name in ("is_active", "is_slider", "is_series_slider", "is_category_only", "is_thumbnail"):
        op.add_column("content_series", sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.true() if name == "is_active" else sa.false()))
    op.create_check_constraint("ck_series_rating", "content_series", "rating >= 0 AND rating <= 10")
    op.create_check_constraint("ck_episode_number_positive", "content_episodes", "season_number >= 1 AND episode_number >= 1")
    op.create_unique_constraint("uq_series_episode_number", "content_episodes", ["series_id", "season_number", "episode_number"], deferrable=True, initially="DEFERRED")


def downgrade() -> None:
    op.drop_constraint("uq_series_episode_number", "content_episodes", type_="unique")
    op.drop_constraint("ck_episode_number_positive", "content_episodes", type_="check")
    op.drop_constraint("ck_series_rating", "content_series", type_="check")
    for name in ("is_thumbnail", "is_category_only", "is_series_slider", "is_slider", "is_active", "publish_at", "publish_option", "rating", "trailer_type", "age_rating", "content_classification", "geo_fencing", "thumbnails", "languages"):
        op.drop_column("content_series", name)