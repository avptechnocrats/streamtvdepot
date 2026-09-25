"""add demo booking tables

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-06-18

"""
from alembic import op
import sqlalchemy as sa

revision: str = "o3p4q5r6s7t8"
down_revision: str = "n2o3p4q5r6s7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE demobookingstatus AS ENUM ('unread', 'read', 'archived');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS demo_booking_requests (
            id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            full_name                    VARCHAR(255) NOT NULL,
            work_email                   VARCHAR(255) NOT NULL,
            company                      VARCHAR(255) NOT NULL,
            role                         VARCHAR(255),
            country_region               VARCHAR(255) NOT NULL,
            phone                        VARCHAR(100) NOT NULL,
            project_details              TEXT NOT NULL,
            status                       demobookingstatus NOT NULL DEFAULT 'unread',
            acknowledged_email_sent_at   TIMESTAMPTZ,
            created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_demo_booking_requests_work_email ON demo_booking_requests(work_email)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_demo_booking_requests_status ON demo_booking_requests(status)"))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS demo_booking_replies (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            booking_id    UUID NOT NULL REFERENCES demo_booking_requests(id) ON DELETE CASCADE,
            author_id     UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            message       TEXT NOT NULL,
            email_sent_at TIMESTAMPTZ,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_demo_booking_replies_booking_id ON demo_booking_replies(booking_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_demo_booking_replies_author_id ON demo_booking_replies(author_id)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS demo_booking_replies"))
    op.execute(sa.text("DROP TABLE IF EXISTS demo_booking_requests"))
    op.execute(sa.text("DROP TYPE IF EXISTS demobookingstatus"))
