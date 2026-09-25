"""add contact submissions table

Revision ID: q5r6s7t8u9v0
Revises: p4q5r6s7t8u9
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "q5r6s7t8u9v0"
down_revision: Union[str, None] = "p4q5r6s7t8u9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE contactsubmissionstatus AS ENUM ('unread', 'read', 'archived');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS contact_submissions (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            full_name   VARCHAR(255) NOT NULL,
            work_email  VARCHAR(255) NOT NULL,
            company     VARCHAR(255),
            phone       VARCHAR(100),
            subject     VARCHAR(255),
            message     TEXT NOT NULL,
            status      contactsubmissionstatus NOT NULL DEFAULT 'unread',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_contact_submissions_client_id ON contact_submissions(client_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_contact_submissions_work_email ON contact_submissions(work_email)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_contact_submissions_status ON contact_submissions(status)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS contact_submissions"))
    op.execute(sa.text("DROP TYPE IF EXISTS contactsubmissionstatus"))