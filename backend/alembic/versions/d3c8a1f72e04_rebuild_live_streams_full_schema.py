"""rebuild_live_streams_full_schema

Revision ID: d3c8a1f72e04
Revises: ff421573efb2
Create Date: 2026-04-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd3c8a1f72e04'
down_revision = 'ff421573efb2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Rename name → title (keep existing data)
    op.alter_column("content_live_streams", "name", new_column_name="title")

    # 2. Extend title column to TEXT length
    op.alter_column(
        "content_live_streams", "title",
        existing_type=sa.String(255),
        type_=sa.String(500),
        nullable=False,
    )

    # 3. Add new columns
    op.add_column("content_live_streams", sa.Column("slug", sa.String(255), nullable=True))
    op.add_column("content_live_streams", sa.Column("source", sa.String(20), nullable=True))
    op.add_column("content_live_streams", sa.Column("thumbnails", postgresql.JSONB(), nullable=True))
    op.add_column("content_live_streams", sa.Column("is_featured", sa.Boolean(), nullable=True))
    op.add_column("content_live_streams", sa.Column("geo_fencing", postgresql.JSONB(), nullable=True))
    op.add_column("content_live_streams", sa.Column("subscription_plan_ids", postgresql.JSONB(), nullable=True))
    op.add_column("content_live_streams", sa.Column("language_new", postgresql.JSONB(), nullable=True))
    op.add_column("content_live_streams", sa.Column("access_type_new", sa.String(20), nullable=True))

    # 4. Migrate access_type from enum to string
    conn.execute(sa.text(
        "UPDATE content_live_streams SET access_type_new = CASE "
        "  WHEN access_type::text = 'ppv' THEN 'pay_per_view' "
        "  WHEN access_type::text = 'subscription' THEN 'subscription' "
        "  ELSE 'free' END"
    ))

    # 5. Back-fill new columns with defaults
    conn.execute(sa.text(
        "UPDATE content_live_streams SET "
        "  slug = LOWER(REGEXP_REPLACE(REPLACE(title, ' ', '-'), '[^a-z0-9-]', '', 'g')), "
        "  source = 'external', "
        "  thumbnails = '{}'::jsonb, "
        "  is_featured = false, "
        "  geo_fencing = '{\"blocked_countries\":[]}'::jsonb, "
        "  subscription_plan_ids = '[]'::jsonb, "
        "  language_new = CASE WHEN language IS NOT NULL AND language != '' "
        "    THEN jsonb_build_array(language) ELSE '[]'::jsonb END "
        "WHERE slug IS NULL"
    ))

    # 6. Make new columns non-nullable where required
    op.alter_column("content_live_streams", "slug", nullable=False)
    op.alter_column("content_live_streams", "source", nullable=False)
    op.alter_column("content_live_streams", "thumbnails", nullable=False)
    op.alter_column("content_live_streams", "is_featured", nullable=False)
    op.alter_column("content_live_streams", "geo_fencing", nullable=False)
    op.alter_column("content_live_streams", "subscription_plan_ids", nullable=False)
    op.alter_column("content_live_streams", "language_new", nullable=False)
    op.alter_column("content_live_streams", "access_type_new", nullable=False)

    # language column already existed — keep it (no-op)

    # 7. Drop old access_type enum column and rename new one
    op.drop_column("content_live_streams", "access_type")
    op.alter_column("content_live_streams", "access_type_new", new_column_name="access_type")

    # 8. Drop old columns no longer needed
    op.drop_column("content_live_streams", "thumbnail_url")
    op.drop_column("content_live_streams", "language")
    op.alter_column("content_live_streams", "language_new", new_column_name="language")
    # language is now a JSONB array

    # 9. Create index on slug
    op.create_index("ix_content_live_streams_slug", "content_live_streams", ["slug"])


def downgrade() -> None:
    op.drop_index("ix_content_live_streams_slug", table_name="content_live_streams")

    op.add_column("content_live_streams", sa.Column("thumbnail_url", sa.Text(), nullable=True))

    # Restore access_type as text (simplified — original enum restoration omitted)
    op.drop_column("content_live_streams", "subscription_plan_ids")
    op.drop_column("content_live_streams", "geo_fencing")
    op.drop_column("content_live_streams", "is_featured")
    op.drop_column("content_live_streams", "thumbnails")
    op.drop_column("content_live_streams", "source")
    op.drop_column("content_live_streams", "slug")

    op.alter_column("content_live_streams", "title", new_column_name="name")
    op.alter_column(
        "content_live_streams", "name",
        existing_type=sa.String(500),
        type_=sa.String(255),
        nullable=False,
    )
