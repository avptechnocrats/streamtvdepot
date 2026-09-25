"""add epg_programs table

Revision ID: g2h4i6j8k9l0
Revises: f1a2b3c4d5e6
Create Date: 2026-05-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "g2h4i6j8k9l0"
down_revision: str = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS epg_programs (
            id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id        UUID        NOT NULL REFERENCES clients(id)             ON DELETE CASCADE,
            channel_id       UUID        NOT NULL REFERENCES content_live_streams(id) ON DELETE CASCADE,
            title            VARCHAR(500) NOT NULL,
            description      TEXT,
            start_time       TIMESTAMPTZ NOT NULL,
            end_time         TIMESTAMPTZ NOT NULL,
            duration_minutes INTEGER     NOT NULL,
            category         VARCHAR(100),
            rating           VARCHAR(20),
            thumbnail_url    TEXT,
            sort_order       INTEGER     NOT NULL DEFAULT 0,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_epg_programs_client_id   ON epg_programs (client_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_epg_programs_channel_id  ON epg_programs (channel_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_epg_programs_start_time  ON epg_programs (start_time)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS epg_programs")
