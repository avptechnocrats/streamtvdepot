"""add demo content publish status

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa

revision = "y4z5a6b7c8d9"
down_revision = "x3y4z5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "superadmin_demo_content",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
    )
    op.alter_column("superadmin_demo_content", "status", server_default="draft")
    op.create_index(
        "ix_superadmin_demo_content_status",
        "superadmin_demo_content",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_superadmin_demo_content_status", table_name="superadmin_demo_content")
    op.drop_column("superadmin_demo_content", "status")