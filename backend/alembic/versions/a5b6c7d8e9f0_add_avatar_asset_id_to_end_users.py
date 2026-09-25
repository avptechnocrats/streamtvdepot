"""add_avatar_asset_id_to_end_users

Revision ID: a5b6c7d8e9f0
Revises: y3z4a5b6c7d8
Create Date: 2026-08-11 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, None] = "y3z4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "end_users",
        sa.Column("avatar_asset_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_end_users_avatar_asset_id_media_assets",
        "end_users",
        "media_assets",
        ["avatar_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_end_users_avatar_asset_id_media_assets", "end_users", type_="foreignkey")
    op.drop_column("end_users", "avatar_asset_id")
