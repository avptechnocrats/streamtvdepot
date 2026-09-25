"""add system mail logs table

Revision ID: s1t2u3v4w5x6
Revises: r6s7t8u9v0w1
Create Date: 2026-07-03

"""

from alembic import op
import sqlalchemy as sa


revision: str = "s1t2u3v4w5x6"
down_revision: str = "r6s7t8u9v0w1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE maildeliverystatus AS ENUM ('sent', 'failed', 'skipped');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS system_mail_logs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
            event_key       VARCHAR(120) NOT NULL,
            recipient_email VARCHAR(255) NOT NULL,
            recipient_name  VARCHAR(255),
            subject         VARCHAR(255) NOT NULL,
            status          maildeliverystatus NOT NULL DEFAULT 'sent',
            transport       VARCHAR(30) NOT NULL DEFAULT 'smtp',
            config_source   VARCHAR(40) NOT NULL DEFAULT 'env',
            error_message   TEXT,
            metadata_json   JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_mail_logs_event_key ON system_mail_logs(event_key)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_mail_logs_status ON system_mail_logs(status)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_mail_logs_client_id ON system_mail_logs(client_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_system_mail_logs_recipient_email ON system_mail_logs(recipient_email)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS system_mail_logs"))
    op.execute(sa.text("DROP TYPE IF EXISTS maildeliverystatus"))
