"""add shared S3 thumbnail key to demo categories

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-10-01
"""
from alembic import op
import sqlalchemy as sa

revision = "w2x3y4z5a6b7"
down_revision = "v1w2x3y4z5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("superadmin_demo_categories", sa.Column("thumbnail_s3_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("superadmin_demo_categories", "thumbnail_s3_key")