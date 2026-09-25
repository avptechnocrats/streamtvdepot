"""add client_pages table

Revision ID: m1n2o3p4q5r6
Revises: l1m2n3o4p5q6
Create Date: 2026-05-20

"""
from alembic import op
import sqlalchemy as sa

revision: str = "m1n2o3p4q5r6"
down_revision: str = "l1m2n3o4p5q6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS client_pages (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            title            VARCHAR(255) NOT NULL,
            slug             VARCHAR(255) NOT NULL,
            body             TEXT,
            short_description TEXT,
            seo_title        VARCHAR(255),
            seo_description  TEXT,
            seo_keywords     TEXT,
            og_image_url     TEXT,
            status           VARCHAR(20) NOT NULL DEFAULT 'draft',
            is_active        BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order       INTEGER NOT NULL DEFAULT 0,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (client_id, slug)
        )
    """))

    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_client_pages_client_id ON client_pages (client_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_client_pages_slug ON client_pages (slug)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS client_pages"))
