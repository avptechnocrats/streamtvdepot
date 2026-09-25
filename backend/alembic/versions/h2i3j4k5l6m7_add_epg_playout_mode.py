"""add playout_mode to epg_programs

Revision ID: h2i3j4k5l6m7
Revises: h1i2j3k4l5m6
Create Date: 2026-05-02

"""
from alembic import op
import sqlalchemy as sa

revision: str = "h2i3j4k5l6m7"
down_revision: str = "h1i2j3k4l5m6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE epg_programs
        ADD COLUMN IF NOT EXISTS playout_mode VARCHAR(20) NOT NULL DEFAULT 'schedule'
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE epg_programs DROP COLUMN IF EXISTS playout_mode")
