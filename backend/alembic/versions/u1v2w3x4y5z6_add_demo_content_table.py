"""add superadmin demo content and categories tables

Revision ID: u1v2w3x4y5z6
Revises: 2a3b4c5d6e7f
Create Date: 2026-07-17

"""
from alembic import op
import sqlalchemy as sa

revision: str = "u1v2w3x4y5z6"
down_revision: str = "2a3b4c5d6e7f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Demo Categories ───────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS superadmin_demo_categories (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name             VARCHAR(255) NOT NULL,
            slug             VARCHAR(255) NOT NULL,
            description      TEXT,
            content_type     VARCHAR(20),
            thumbnail_url    TEXT,
            sort_order       INTEGER      NOT NULL DEFAULT 0,
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT uq_demo_category_slug UNIQUE (slug)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_demo_categories_content_type "
        "ON superadmin_demo_categories(content_type)"
    ))

    # ── Demo Content ──────────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS superadmin_demo_content (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title            VARCHAR(500) NOT NULL,
            content_type     VARCHAR(20)  NOT NULL,
            stream_url       TEXT,
            thumbnail_url    TEXT,
            description      TEXT,
            short_description TEXT,
            duration_seconds INTEGER,
            genre            VARCHAR(100),
            language         VARCHAR(100),
            artist           VARCHAR(255),
            album            VARCHAR(255),
            age_rating       VARCHAR(20),
            is_featured      BOOLEAN      NOT NULL DEFAULT FALSE,
            extra_data       JSONB        NOT NULL DEFAULT '{}',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_demo_content_type "
        "ON superadmin_demo_content(content_type)"
    ))

    # ── M2M Join ──────────────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS superadmin_demo_content_categories (
            demo_content_id  UUID NOT NULL REFERENCES superadmin_demo_content(id)  ON DELETE CASCADE,
            demo_category_id UUID NOT NULL REFERENCES superadmin_demo_categories(id) ON DELETE CASCADE,
            PRIMARY KEY (demo_content_id, demo_category_id)
        )
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS superadmin_demo_content_categories"))
    op.execute(sa.text("DROP TABLE IF EXISTS superadmin_demo_content"))
    op.execute(sa.text("DROP TABLE IF EXISTS superadmin_demo_categories"))
