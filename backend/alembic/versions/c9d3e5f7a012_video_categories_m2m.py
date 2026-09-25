"""video categories: JSONB array → many-to-many join table

Revision ID: c9d3e5f7a012
Revises: b8f2d4e6a901
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "c9d3e5f7a012"
down_revision = "b8f2d4e6a901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create the join table (idempotent)
    op.execute("""
        CREATE TABLE IF NOT EXISTS video_categories (
            video_id    UUID NOT NULL REFERENCES content_videos(id)      ON DELETE CASCADE,
            category_id UUID NOT NULL REFERENCES content_categories(id)  ON DELETE CASCADE,
            PRIMARY KEY (video_id, category_id)
        )
    """)

    # 2. Populate from the existing JSONB column: match slug → category id per client
    op.execute("""
        INSERT INTO video_categories (video_id, category_id)
        SELECT DISTINCT v.id, c.id
        FROM content_videos v
        CROSS JOIN LATERAL jsonb_array_elements_text(v.categories) AS cat_slug
        JOIN content_categories c
            ON c.slug = cat_slug
           AND c.client_id = v.client_id
        WHERE v.categories IS NOT NULL
          AND jsonb_array_length(v.categories) > 0
        ON CONFLICT DO NOTHING
    """)

    # 3. Drop the now-redundant JSONB column (idempotent)
    op.execute("ALTER TABLE content_videos DROP COLUMN IF EXISTS categories")


def downgrade() -> None:
    # Re-add JSONB column
    op.add_column(
        "content_videos",
        sa.Column("categories", sa.dialects.postgresql.JSONB(), nullable=False, server_default="[]"),
    )

    # Repopulate from join table
    op.execute("""
        UPDATE content_videos v
        SET categories = sub.slugs
        FROM (
            SELECT vc.video_id,
                   jsonb_agg(c.slug ORDER BY c.sort_order, c.name) AS slugs
            FROM video_categories vc
            JOIN content_categories c ON c.id = vc.category_id
            GROUP BY vc.video_id
        ) sub
        WHERE v.id = sub.video_id
    """)

    # Drop join table
    op.drop_table("video_categories")
