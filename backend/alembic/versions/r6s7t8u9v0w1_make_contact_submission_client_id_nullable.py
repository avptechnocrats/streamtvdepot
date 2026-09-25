"""make contact_submission client_id nullable

Revision ID: r6s7t8u9v0w1
Revises: q5r6s7t8u9v0
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r6s7t8u9v0w1"
down_revision: Union[str, None] = "q5r6s7t8u9v0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE contact_submissions
        ALTER COLUMN client_id DROP NOT NULL
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE contact_submissions
        ALTER COLUMN client_id SET NOT NULL
    """))
