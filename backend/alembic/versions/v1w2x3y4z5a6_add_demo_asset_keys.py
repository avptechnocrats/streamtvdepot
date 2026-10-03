"""add immutable shared S3 keys to demo content

Revision ID: v1w2x3y4z5a6
Revises: j2k3l4m5n6o7
Create Date: 2026-09-30
"""
from alembic import op
import sqlalchemy as sa

revision = "v1w2x3y4z5a6"
down_revision = "j2k3l4m5n6o7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("superadmin_demo_content", sa.Column("stream_s3_key", sa.Text(), nullable=True))
    op.add_column("superadmin_demo_content", sa.Column("thumbnail_s3_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("superadmin_demo_content", "thumbnail_s3_key")
    op.drop_column("superadmin_demo_content", "stream_s3_key")