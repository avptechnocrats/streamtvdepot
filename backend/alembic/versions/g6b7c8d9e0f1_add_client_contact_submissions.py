"""add client_contact_submissions and move tenant rows out of contact_submissions

Revision ID: g6b7c8d9e0f1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g6b7c8d9e0f1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS client_contact_submissions (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            form_data   JSONB NOT NULL,
            status      contactsubmissionstatus NOT NULL DEFAULT 'unread',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_client_contact_submissions_client_status_created "
        "ON client_contact_submissions(client_id, status, created_at DESC)"
    ))

    # Preserve tenant submissions already stored in the main-site table.
    op.execute(sa.text("""
        INSERT INTO client_contact_submissions (id, client_id, form_data, status, created_at, updated_at)
        SELECT id, client_id,
               jsonb_build_array(
                   jsonb_build_object('id', 'full_name', 'label', 'Full Name', 'type', 'text', 'value', full_name),
                   jsonb_build_object('id', 'work_email', 'label', 'Email', 'type', 'email', 'value', work_email),
                   jsonb_build_object('id', 'company', 'label', 'Company', 'type', 'text', 'value', company),
                   jsonb_build_object('id', 'phone', 'label', 'Phone', 'type', 'text', 'value', phone),
                   jsonb_build_object('id', 'subject', 'label', 'Subject', 'type', 'text', 'value', subject),
                   jsonb_build_object('id', 'message', 'label', 'Message', 'type', 'textarea', 'value', message)
               ),
               status, created_at, updated_at
        FROM contact_submissions
        WHERE client_id IS NOT NULL
        ON CONFLICT (id) DO NOTHING
    """))
    op.execute(sa.text("DELETE FROM contact_submissions WHERE client_id IS NOT NULL"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS client_contact_submissions"))
