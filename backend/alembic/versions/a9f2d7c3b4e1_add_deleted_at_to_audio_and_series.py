"""add deleted_at to audio and series

Revision ID: a9f2d7c3b4e1
Revises: f4d4b8e8a1c2
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a9f2d7c3b4e1"
down_revision = "f4d4b8e8a1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("content_audio", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("content_series", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("content_series", "deleted_at")
    op.drop_column("content_audio", "deleted_at")
