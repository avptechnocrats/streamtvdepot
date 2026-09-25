"""add content_type to content_categories

Revision ID: c7d2a9b14e05
Revises: a4c8e1f23b90
Create Date: 2026-04-10 00:00:00.000000
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7d2a9b14e05"
down_revision: Union[str, None] = "a4c8e1f23b90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "content_categories",
        sa.Column("content_type", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("content_categories", "content_type")
