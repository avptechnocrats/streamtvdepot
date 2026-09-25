"""media_assets_file_size_bigint

Revision ID: p4q5r6s7t8u9
Revises: o3p4q5r6s7t8
Create Date: 2026-06-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p4q5r6s7t8u9"
down_revision: Union[str, None] = "o3p4q5r6s7t8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Prevent integer overflow for large uploads (>2GB) by widening to BIGINT.
    op.execute("ALTER TABLE media_assets ALTER COLUMN file_size TYPE BIGINT")


def downgrade() -> None:
    op.execute("ALTER TABLE media_assets ALTER COLUMN file_size TYPE INTEGER")
