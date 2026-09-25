"""add currency restriction to coupons

Revision ID: w5x6y7z8a9b
Revises: v4w5x6y7z8a9
Create Date: 2026-09-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "w5x6y7z8a9b"
down_revision: Union[str, None] = "v4w5x6y7z8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("coupons", sa.Column("currency", sa.String(length=3), nullable=True))


def downgrade() -> None:
    op.drop_column("coupons", "currency")