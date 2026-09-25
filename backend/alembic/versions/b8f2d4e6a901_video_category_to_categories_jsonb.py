"""Replace Video.category (string) with Video.categories (JSONB array of slugs)

Revision ID: b8f2d4e6a901
Revises: f3a1b2c4d5e6
Create Date: 2026-04-23

Changes on content_videos:
  - Add   categories   JSONB NOT NULL DEFAULT '[]'
  - Migrate existing   category   string → single-element array  [category]
  - Drop   category   VARCHAR(100)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# ── Revision identifiers ──────────────────────────────────────────────────────

revision: str = "b8f2d4e6a901"
down_revision: str | None = "f3a1b2c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add new JSONB column with empty-array default (idempotent)
    op.execute("""
        ALTER TABLE content_videos
        ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]'::jsonb
    """)

    # 2. Migrate existing single category string → one-element array of that string
    #    We store the category *name* that was there before; the form will now save slugs
    #    going forward but existing data keeps the name so displays still work.
    op.execute(
        """
        UPDATE content_videos
        SET categories = CASE
            WHEN category IS NOT NULL AND category <> ''
            THEN jsonb_build_array(category)
            ELSE '[]'::jsonb
        END
        """
    )

    # 3. Drop the old column
    op.drop_column("content_videos", "category")


def downgrade() -> None:
    # 1. Re-add the old column
    op.add_column(
        "content_videos",
        sa.Column("category", sa.String(100), nullable=True),
    )

    # 2. Restore first element of the array (best-effort)
    op.execute(
        """
        UPDATE content_videos
        SET category = CASE
            WHEN jsonb_array_length(categories) > 0
            THEN categories ->> 0
            ELSE NULL
        END
        """
    )

    # 3. Drop the JSONB column
    op.drop_column("content_videos", "categories")
