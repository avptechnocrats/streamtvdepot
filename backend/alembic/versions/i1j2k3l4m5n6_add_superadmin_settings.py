"""add superadmin_settings table

Revision ID: i1j2k3l4m5n6
Revises: h2i3j4k5l6m7
Create Date: 2026-05-02

"""
from alembic import op
import sqlalchemy as sa

revision: str = "i1j2k3l4m5n6"
down_revision: str = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS superadmin_settings (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            config      JSONB NOT NULL DEFAULT '{}',
            is_active   BOOLEAN NOT NULL DEFAULT true,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))


def downgrade() -> None:
    op.drop_table("superadmin_settings")
