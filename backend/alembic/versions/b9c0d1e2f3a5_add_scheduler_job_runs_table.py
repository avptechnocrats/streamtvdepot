"""add scheduler job runs table

Revision ID: b9c0d1e2f3a5
Revises: ab1cd2ef3ab4
Create Date: 2026-09-03

"""

from alembic import op
import sqlalchemy as sa


revision: str = "b9c0d1e2f3a5"
down_revision: str = "ab1cd2ef3ab4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE schedulerjobstatus AS ENUM ('running', 'success', 'failed');"
        " EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS scheduler_job_runs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id          VARCHAR(120) NOT NULL,
            job_name        VARCHAR(255) NOT NULL,
            status          schedulerjobstatus NOT NULL DEFAULT 'success',
            started_at      TIMESTAMPTZ,
            finished_at     TIMESTAMPTZ,
            duration_ms     INTEGER,
            error_message   TEXT,
            metadata_json   JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_scheduler_job_runs_job_id ON scheduler_job_runs(job_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_scheduler_job_runs_job_name ON scheduler_job_runs(job_name)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_scheduler_job_runs_status ON scheduler_job_runs(status)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_scheduler_job_runs_started_at ON scheduler_job_runs(started_at)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS scheduler_job_runs"))
    op.execute(sa.text("DROP TYPE IF EXISTS schedulerjobstatus"))
