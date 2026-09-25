"""rebuild content_videos full schema

Revision ID: a4c8e1f23b90
Revises: ff421573efb2
Create Date: 2026-04-10 00:00:00.000000
"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a4c8e1f23b90"
down_revision: Union[str, None] = "ff421573efb2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Add new columns (nullable initially for data migration) ────────────
    op.add_column("content_videos", sa.Column("slug", sa.String(255), nullable=True))
    op.add_column("content_videos", sa.Column("short_description", sa.Text(), nullable=True))
    op.add_column("content_videos", sa.Column("long_description", sa.Text(), nullable=True))
    op.add_column("content_videos", sa.Column("category", sa.String(100), nullable=True))
    op.add_column("content_videos", sa.Column("age_rating", sa.String(20), nullable=True))
    op.add_column("content_videos", sa.Column("content_classification", sa.String(100), nullable=True))
    op.add_column("content_videos", sa.Column("rating", sa.Numeric(3, 1), nullable=True))
    op.add_column("content_videos", sa.Column("duration", sa.Integer(), nullable=True))
    op.add_column("content_videos", sa.Column("cast_crew", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("related_video_ids", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("geo_fencing", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("intro_times", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("is_active", sa.Boolean(), nullable=True))
    op.add_column("content_videos", sa.Column("is_slider", sa.Boolean(), nullable=True))
    op.add_column("content_videos", sa.Column("is_thumbnail", sa.Boolean(), nullable=True))
    op.add_column("content_videos", sa.Column("advertisement", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("thumbnails", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("trailer_type", sa.String(20), nullable=True))
    op.add_column("content_videos", sa.Column("subscription_plan_ids", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("ppv_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("content_videos", sa.Column("publish_option", sa.String(10), nullable=True))
    op.add_column("content_videos", sa.Column("publish_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("content_videos", sa.Column("seo", postgresql.JSONB(), nullable=True))
    op.add_column("content_videos", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    # New access_type as TEXT (replaces the old enum column)
    op.add_column("content_videos", sa.Column("new_access_type", sa.String(20), nullable=True))

    # ── 2. Migrate existing data ──────────────────────────────────────────────
    conn.execute(sa.text(
        "UPDATE content_videos SET short_description = description WHERE description IS NOT NULL"
    ))
    conn.execute(sa.text(
        "UPDATE content_videos SET thumbnails = jsonb_build_object("
        "  'video_thumbnail_url', thumbnail_url,"
        "  'player_thumbnail_url', NULL,"
        "  'tv_thumbnail_url', NULL,"
        "  'title_thumbnail_url', NULL"
        ") WHERE thumbnail_url IS NOT NULL"
    ))
    # Generate slugs: lowercase title, replace non-alphanumeric with hyphen
    conn.execute(sa.text(
        "UPDATE content_videos "
        "SET slug = LOWER(REGEXP_REPLACE(TRIM(title), '[^a-zA-Z0-9]+', '-', 'g')) "
        "WHERE slug IS NULL"
    ))
    # Ensure slugs are non-empty
    conn.execute(sa.text(
        "UPDATE content_videos "
        "SET slug = CONCAT('video-', SUBSTRING(id::text, 1, 8)) "
        "WHERE slug IS NULL OR slug = '' OR slug = '-'"
    ))
    # Set defaults for boolean/jsonb/string columns
    conn.execute(sa.text("UPDATE content_videos SET is_active = TRUE WHERE is_active IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET is_slider = FALSE WHERE is_slider IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET is_thumbnail = FALSE WHERE is_thumbnail IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET cast_crew = '[]'::jsonb WHERE cast_crew IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET related_video_ids = '[]'::jsonb WHERE related_video_ids IS NULL"))
    conn.execute(sa.text(
        """UPDATE content_videos SET geo_fencing = '{"blocked_countries": [], "allowed_countries": []}'::jsonb """
        "WHERE geo_fencing IS NULL"
    ))
    conn.execute(sa.text("UPDATE content_videos SET intro_times = '{}'::jsonb WHERE intro_times IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET advertisement = '{}'::jsonb WHERE advertisement IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET thumbnails = '{}'::jsonb WHERE thumbnails IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET subscription_plan_ids = '[]'::jsonb WHERE subscription_plan_ids IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET seo = '{}'::jsonb WHERE seo IS NULL"))
    conn.execute(sa.text("UPDATE content_videos SET publish_option = 'now' WHERE publish_option IS NULL"))
    # Migrate access_type: ppv → pay_per_view, rental → free
    conn.execute(sa.text(
        "UPDATE content_videos SET new_access_type = CASE "
        "  WHEN access_type::text = 'ppv' THEN 'pay_per_view' "
        "  WHEN access_type::text = 'subscription' THEN 'subscription' "
        "  ELSE 'free' "
        "END"
    ))

    # ── 3. Apply NOT NULL constraints ─────────────────────────────────────────
    op.alter_column("content_videos", "slug", nullable=False)
    op.alter_column("content_videos", "cast_crew", nullable=False)
    op.alter_column("content_videos", "related_video_ids", nullable=False)
    op.alter_column("content_videos", "geo_fencing", nullable=False)
    op.alter_column("content_videos", "intro_times", nullable=False)
    op.alter_column("content_videos", "is_active", nullable=False)
    op.alter_column("content_videos", "is_slider", nullable=False)
    op.alter_column("content_videos", "is_thumbnail", nullable=False)
    op.alter_column("content_videos", "advertisement", nullable=False)
    op.alter_column("content_videos", "thumbnails", nullable=False)
    op.alter_column("content_videos", "subscription_plan_ids", nullable=False)
    op.alter_column("content_videos", "seo", nullable=False)
    op.alter_column("content_videos", "publish_option", nullable=False)
    op.alter_column("content_videos", "new_access_type", nullable=False)

    # ── 4. Swap access_type column ────────────────────────────────────────────
    op.drop_column("content_videos", "access_type")
    op.alter_column("content_videos", "new_access_type", new_column_name="access_type")

    # ── 5. Drop old columns ───────────────────────────────────────────────────
    op.drop_column("content_videos", "description")
    op.drop_column("content_videos", "director")
    op.drop_column("content_videos", "cast")
    op.drop_column("content_videos", "genre")
    op.drop_column("content_videos", "duration_seconds")
    op.drop_column("content_videos", "release_year")
    op.drop_column("content_videos", "status")
    op.drop_column("content_videos", "thumbnail_url")

    # ── 6. Add indexes ────────────────────────────────────────────────────────
    op.create_index("ix_content_videos_slug", "content_videos", ["slug"])
    op.create_index(
        "uq_content_videos_client_slug",
        "content_videos",
        ["client_id", "slug"],
        unique=True,
    )


def downgrade() -> None:
    # Remove new indexes
    op.drop_index("uq_content_videos_client_slug", table_name="content_videos")
    op.drop_index("ix_content_videos_slug", table_name="content_videos")

    # Restore old access_type column using the original accesstype enum
    op.add_column(
        "content_videos",
        sa.Column(
            "old_access_type",
            postgresql.ENUM("free", "subscription", "ppv", "rental", name="accesstype", create_type=False),
            nullable=True,
        ),
    )
    op.get_bind().execute(sa.text(
        "UPDATE content_videos SET old_access_type = CASE "
        "  WHEN access_type::text = 'pay_per_view' THEN 'ppv'::accesstype "
        "  WHEN access_type::text = 'subscription' THEN 'subscription'::accesstype "
        "  ELSE 'free'::accesstype "
        "END"
    ))
    op.alter_column("content_videos", "old_access_type", nullable=False)
    op.drop_column("content_videos", "access_type")
    op.alter_column("content_videos", "old_access_type", new_column_name="access_type")

    # Restore old columns
    op.add_column("content_videos", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("content_videos", sa.Column("director", sa.String(255), nullable=True))
    op.add_column("content_videos", sa.Column("cast", sa.Text(), nullable=True))
    op.add_column("content_videos", sa.Column("genre", sa.String(100), nullable=True))
    op.add_column("content_videos", sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column("content_videos", sa.Column("release_year", sa.Integer(), nullable=True))
    op.add_column(
        "content_videos",
        sa.Column(
            "status",
            postgresql.ENUM("draft", "published", "archived", "scheduled", name="contentstatus", create_type=False),
            nullable=True,
        ),
    )
    op.add_column("content_videos", sa.Column("thumbnail_url", sa.Text(), nullable=True))

    # Migrate data back
    op.get_bind().execute(sa.text(
        "UPDATE content_videos SET description = short_description"
    ))

    # Drop new columns
    for col in [
        "slug", "short_description", "long_description", "category", "age_rating",
        "content_classification", "rating", "duration", "cast_crew", "related_video_ids",
        "geo_fencing", "intro_times", "is_active", "is_slider", "is_thumbnail",
        "advertisement", "thumbnails", "trailer_type", "subscription_plan_ids",
        "ppv_price", "publish_option", "publish_at", "seo", "deleted_at",
    ]:
        op.drop_column("content_videos", col)

    # Drop the videoaccesstype enum
    postgresql.ENUM(name="videoaccesstype").drop(op.get_bind(), checkfirst=True)
