"""add image_url to support_tickets

Revision ID: a1b2c3d4e5f7
Revises: z6d7e8f9a0b1
Create Date: 2026-08-24 22:58:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f7"
down_revision: str = "z6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS image_url VARCHAR"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE support_tickets DROP COLUMN IF EXISTS image_url"))
