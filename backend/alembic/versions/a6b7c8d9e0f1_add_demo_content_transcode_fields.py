"""add demo content transcode fields

Revision ID: a6b7c8d9e0f1
Revises: y4z5a6b7c8d9
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa


revision = "a6b7c8d9e0f1"
down_revision = "y4z5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("superadmin_demo_content", sa.Column("transcode_status", sa.String(length=20), nullable=True))
    op.add_column("superadmin_demo_content", sa.Column("transcode_job_id", sa.String(length=255), nullable=True))
    op.add_column("superadmin_demo_content", sa.Column("transcode_progress", sa.Integer(), nullable=True))
    op.add_column("superadmin_demo_content", sa.Column("hls_manifest_key", sa.Text(), nullable=True))
    op.add_column("superadmin_demo_content", sa.Column("hls_url", sa.Text(), nullable=True))
    op.create_index(
        "ix_superadmin_demo_content_transcode_status",
        "superadmin_demo_content",
        ["transcode_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_superadmin_demo_content_transcode_status", table_name="superadmin_demo_content")
    op.drop_column("superadmin_demo_content", "hls_url")
    op.drop_column("superadmin_demo_content", "hls_manifest_key")
    op.drop_column("superadmin_demo_content", "transcode_progress")
    op.drop_column("superadmin_demo_content", "transcode_job_id")
    op.drop_column("superadmin_demo_content", "transcode_status")