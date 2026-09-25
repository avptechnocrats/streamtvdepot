"""add_site_config_to_clients

Revision ID: a1c3e2f84b90
Revises: ff421573efb2
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'a1c3e2f84b90'
down_revision: Union[str, tuple] = ('ff421573efb2', 'a9b3c2d1e0f4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'clients' AND column_name = 'site_config'
            ) THEN
                ALTER TABLE clients ADD COLUMN site_config JSONB;
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    op.drop_column('clients', 'site_config')
