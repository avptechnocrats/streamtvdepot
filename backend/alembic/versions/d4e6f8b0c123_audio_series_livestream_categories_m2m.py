"""audio/series/livestream categories: add M2M join tables, drop livestream.category

Revision ID: d4e6f8b0c123
Revises: c9d3e5f7a012
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "d4e6f8b0c123"
down_revision = "c9d3e5f7a012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── audio_categories ──────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS audio_categories (
            audio_id    UUID NOT NULL REFERENCES content_audio(id)        ON DELETE CASCADE,
            category_id UUID NOT NULL REFERENCES content_categories(id)   ON DELETE CASCADE,
            PRIMARY KEY (audio_id, category_id)
        )
    """)

    # ── series_categories ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS series_categories (
            series_id   UUID NOT NULL REFERENCES content_series(id)       ON DELETE CASCADE,
            category_id UUID NOT NULL REFERENCES content_categories(id)   ON DELETE CASCADE,
            PRIMARY KEY (series_id, category_id)
        )
    """)

    # ── livestream_categories ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS livestream_categories (
            livestream_id UUID NOT NULL REFERENCES content_live_streams(id) ON DELETE CASCADE,
            category_id   UUID NOT NULL REFERENCES content_categories(id)   ON DELETE CASCADE,
            PRIMARY KEY (livestream_id, category_id)
        )
    """)

    # Migrate existing LiveStream.category string → join table
    op.execute("""
        INSERT INTO livestream_categories (livestream_id, category_id)
        SELECT ls.id, c.id
        FROM content_live_streams ls
        JOIN content_categories c
            ON c.slug = ls.category
           AND c.client_id = ls.client_id
        WHERE ls.category IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    # Drop the old single-string column (idempotent)
    op.execute("ALTER TABLE content_live_streams DROP COLUMN IF EXISTS category")


def downgrade() -> None:
    # Re-add LiveStream.category string column
    op.add_column(
        "content_live_streams",
        sa.Column("category", sa.String(100), nullable=True),
    )

    # Restore first category slug per livestream
    op.execute("""
        UPDATE content_live_streams ls
        SET category = sub.slug
        FROM (
            SELECT lc.livestream_id, c.slug
            FROM livestream_categories lc
            JOIN content_categories c ON c.id = lc.category_id
            ORDER BY c.sort_order, c.name
        ) sub
        WHERE ls.id = sub.livestream_id
    """)

    op.drop_table("livestream_categories")
    op.drop_table("series_categories")
    op.drop_table("audio_categories")
