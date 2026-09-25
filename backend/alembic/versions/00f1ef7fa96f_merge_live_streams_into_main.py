"""merge_live_streams_into_main

Revision ID: 00f1ef7fa96f
Revises: a1d3e7f924bc, d3c8a1f72e04
Create Date: 2026-04-14 15:35:41.016414

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '00f1ef7fa96f'
down_revision: Union[str, None] = ('a1d3e7f924bc', 'd3c8a1f72e04')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
