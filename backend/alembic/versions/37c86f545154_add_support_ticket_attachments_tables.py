"""add support_ticket_attachments and support_ticket_comment_attachments tables

Revision ID: 37c86f545154
Revises: a1b2c3d4e5f7
Create Date: 2026-08-27 14:20:49.731062

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '37c86f545154'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create support_ticket_attachments table
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS support_ticket_attachments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
            file_url    VARCHAR NOT NULL,
            file_name   VARCHAR NOT NULL,
            file_type   VARCHAR NOT NULL,
            file_size   INTEGER NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_support_ticket_attachments_ticket_id "
        "ON support_ticket_attachments(ticket_id)"
    ))

    # Create support_ticket_comment_attachments table
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS support_ticket_comment_attachments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            comment_id  UUID NOT NULL REFERENCES support_ticket_comments(id) ON DELETE CASCADE,
            file_url    VARCHAR NOT NULL,
            file_name   VARCHAR NOT NULL,
            file_type   VARCHAR NOT NULL,
            file_size   INTEGER NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_support_ticket_comment_attachments_comment_id "
        "ON support_ticket_comment_attachments(comment_id)"
    ))

    # Drop the legacy image_url column from support_tickets
    op.execute(sa.text("ALTER TABLE support_tickets DROP COLUMN IF EXISTS image_url"))


def downgrade() -> None:
    # Restore image_url column
    op.execute(sa.text("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS image_url VARCHAR"))
    
    # Drop attachment tables
    op.execute(sa.text("DROP TABLE IF EXISTS support_ticket_comment_attachments"))
    op.execute(sa.text("DROP TABLE IF EXISTS support_ticket_attachments"))
