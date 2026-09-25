"""add is_trial to saas subscription plans

Revision ID: 2a3b4c5d6e7f
Revises: 1f2e3d4c5b6a
Create Date: 2026-07-09

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2a3b4c5d6e7f"
down_revision: Union[str, Sequence[str], None] = "1f2e3d4c5b6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "saas_subscription_plans",
        sa.Column("is_trial", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("saas_subscription_plans", "is_trial")
