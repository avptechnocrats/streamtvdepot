"""add_ppv_live_state

Revision ID: z8b9c0d1e2f3
Revises: z7a8b9c0d1e2
Create Date: 2026-09-13 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "z8b9c0d1e2f3"
down_revision: Union[str, None] = "z7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_ppv_events",
        sa.Column("is_live", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("content_ppv_events", "is_live")