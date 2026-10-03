"""add demo category publish status

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa

revision = "x3y4z5a6b7c8"
down_revision = "w2x3y4z5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "superadmin_demo_categories",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
    )
    op.alter_column("superadmin_demo_categories", "status", server_default="draft")
    op.create_index(
        "ix_superadmin_demo_categories_status",
        "superadmin_demo_categories",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_superadmin_demo_categories_status", table_name="superadmin_demo_categories")
    op.drop_column("superadmin_demo_categories", "status")