"""add admin support ticket attachments tables

Revision ID: 48d97f656265
Revises: 37c86f545154
Create Date: 2026-08-27 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48d97f656265'
down_revision: Union[str, None] = '37c86f545154'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create admin_support_ticket_attachments table
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS admin_support_ticket_attachments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticket_id   UUID NOT NULL REFERENCES admin_support_tickets(id) ON DELETE CASCADE,
            file_url    VARCHAR NOT NULL,
            file_name   VARCHAR NOT NULL,
            file_type   VARCHAR NOT NULL,
            file_size   INTEGER NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_admin_support_ticket_attachments_ticket_id "
        "ON admin_support_ticket_attachments(ticket_id)"
    ))

    # Create admin_support_ticket_comment_attachments table
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS admin_support_ticket_comment_attachments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            comment_id  UUID NOT NULL REFERENCES admin_support_ticket_comments(id) ON DELETE CASCADE,
            file_url    VARCHAR NOT NULL,
            file_name   VARCHAR NOT NULL,
            file_type   VARCHAR NOT NULL,
            file_size   INTEGER NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_admin_support_ticket_comment_attachments_comment_id "
        "ON admin_support_ticket_comment_attachments(comment_id)"
    ))


def downgrade() -> None:
    # Drop attachment tables
    op.execute(sa.text("DROP TABLE IF EXISTS admin_support_ticket_comment_attachments"))
    op.execute(sa.text("DROP TABLE IF EXISTS admin_support_ticket_attachments"))
