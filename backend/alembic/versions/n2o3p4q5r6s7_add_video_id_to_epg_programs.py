"""add video_id to epg_programs

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-06-01

"""
from alembic import op

revision: str = "n2o3p4q5r6s7"
down_revision: str = "m1n2o3p4q5r6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE epg_programs
        ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES content_videos(id) ON DELETE SET NULL
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_epg_programs_video_id ON epg_programs (video_id)
    """)


def downgrade() -> None:
    op.execute("""DROP INDEX IF EXISTS ix_epg_programs_video_id""")
    op.execute("""ALTER TABLE epg_programs DROP COLUMN IF EXISTS video_id""")
