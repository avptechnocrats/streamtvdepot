"""add support ticket tables

Revision ID: j1k2l3m4n5o6
Revises: i1j2k3l4m5n6
Create Date: 2026-05-02

"""
from alembic import op
import sqlalchemy as sa

revision: str = "j1k2l3m4n5o6"
down_revision: str = "i1j2k3l4m5n6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Each op.execute() must contain exactly ONE statement (asyncpg limitation)

    # Enums
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE ticketstatus AS ENUM ('open', 'in_progress', 'resolved', 'closed');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE ticketpriority AS ENUM ('low', 'medium', 'high');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE ticketauthortype AS ENUM ('end_user', 'client_admin');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE adminticketauthortype AS ENUM ('client_admin', 'super_admin');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))

    # support_tickets
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS support_tickets (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            raised_by   UUID NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
            title       VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            status      ticketstatus NOT NULL DEFAULT 'open',
            priority    ticketpriority NOT NULL DEFAULT 'medium',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_support_tickets_client_id ON support_tickets(client_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_support_tickets_raised_by ON support_tickets(raised_by)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_support_tickets_status ON support_tickets(status)"))

    # support_ticket_comments
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS support_ticket_comments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
            author_type ticketauthortype NOT NULL,
            author_id   UUID NOT NULL,
            message     TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_support_ticket_comments_ticket_id ON support_ticket_comments(ticket_id)"))

    # admin_support_tickets
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS admin_support_tickets (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            raised_by   UUID NOT NULL REFERENCES client_admin_users(id) ON DELETE CASCADE,
            title       VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            status      ticketstatus NOT NULL DEFAULT 'open',
            priority    ticketpriority NOT NULL DEFAULT 'medium',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_admin_support_tickets_client_id ON admin_support_tickets(client_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_admin_support_tickets_raised_by ON admin_support_tickets(raised_by)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_admin_support_tickets_status ON admin_support_tickets(status)"))

    # admin_support_ticket_comments
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS admin_support_ticket_comments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticket_id   UUID NOT NULL REFERENCES admin_support_tickets(id) ON DELETE CASCADE,
            author_type adminticketauthortype NOT NULL,
            author_id   UUID NOT NULL,
            message     TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_admin_support_ticket_comments_ticket_id ON admin_support_ticket_comments(ticket_id)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS admin_support_ticket_comments"))
    op.execute(sa.text("DROP TABLE IF EXISTS admin_support_tickets"))
    op.execute(sa.text("DROP TABLE IF EXISTS support_ticket_comments"))
    op.execute(sa.text("DROP TABLE IF EXISTS support_tickets"))
    op.execute(sa.text("DROP TYPE IF EXISTS adminticketauthortype"))
    op.execute(sa.text("DROP TYPE IF EXISTS ticketauthortype"))
    op.execute(sa.text("DROP TYPE IF EXISTS ticketpriority"))
    op.execute(sa.text("DROP TYPE IF EXISTS ticketstatus"))
