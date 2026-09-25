"""add advertisement event ledger

Revision ID: a7b8c9d0e1f2
Revises: n1o2t3i4f5y6
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7b8c9d0e1f2"
down_revision = "n1o2t3i4f5y6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # idempotent — IF NOT EXISTS variant already handles re-runs
    op.execute("ALTER TYPE adtype ADD VALUE IF NOT EXISTS 'NATIVE'")

    # convert starts_at / ends_at only while they are still VARCHAR
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'advertisements'
                   AND column_name = 'starts_at'
                   AND data_type = 'character varying'
            ) THEN
                ALTER TABLE advertisements
                    ALTER COLUMN starts_at TYPE TIMESTAMPTZ
                        USING CASE WHEN starts_at IS NULL OR starts_at = ''
                                   THEN NULL
                                   ELSE starts_at::TIMESTAMPTZ END,
                    ALTER COLUMN ends_at TYPE TIMESTAMPTZ
                        USING CASE WHEN ends_at IS NULL OR ends_at = ''
                                   THEN NULL
                                   ELSE ends_at::TIMESTAMPTZ END;
            END IF;
        END $$;
    """)

    # create enum only when absent — init_db create_all() may have already made it
    op.execute("""
        DO $$
        BEGIN
            CREATE TYPE adeventtype AS ENUM (
                'REQUEST','IMPRESSION','START','FIRST_QUARTILE','MIDPOINT',
                'THIRD_QUARTILE','COMPLETE','SKIP','ERROR','CLICK'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS advertisement_events (
            id               UUID         PRIMARY KEY,
            client_id        UUID         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            advertisement_id UUID         NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
            event_id         VARCHAR(128) NOT NULL,
            event_type       adeventtype  NOT NULL,
            session_id       VARCHAR(128) NOT NULL,
            content_type     VARCHAR(50),
            content_id       VARCHAR(50),
            placement_type   VARCHAR(50),
            occurred_at      TIMESTAMPTZ  NOT NULL,
            metadata         JSONB        NOT NULL DEFAULT '{}'::jsonb,
            billable_amount  NUMERIC(12,6) NOT NULL DEFAULT 0,
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT uq_ad_event_client_event_id UNIQUE (client_id, event_id)
        )
    """)

    for col, name in [
        ("client_id",        "ix_advertisement_events_client_id"),
        ("advertisement_id", "ix_advertisement_events_advertisement_id"),
        ("event_type",       "ix_advertisement_events_event_type"),
        ("session_id",       "ix_advertisement_events_session_id"),
    ]:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {name} ON advertisement_events ({col})"
        )


def downgrade() -> None:
    op.drop_table("advertisement_events")
    sa.Enum(name="adeventtype").drop(op.get_bind(), checkfirst=True)
    op.alter_column(
        "advertisements", "starts_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(length=50),
        postgresql_using="starts_at::text",
    )
    op.alter_column(
        "advertisements", "ends_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(length=50),
        postgresql_using="ends_at::text",
    )

    op.execute("ALTER TYPE adtype ADD VALUE IF NOT EXISTS 'NATIVE'")
    op.alter_column(
        "advertisements",
        "starts_at",
        existing_type=sa.String(length=50),
        type_=sa.DateTime(timezone=True),
        postgresql_using="NULLIF(starts_at, '')::timestamptz",
    )
    op.alter_column(
        "advertisements",
        "ends_at",
        existing_type=sa.String(length=50),
        type_=sa.DateTime(timezone=True),
        postgresql_using="NULLIF(ends_at, '')::timestamptz",
    )
    op.create_table(
        "advertisement_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("advertisement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("advertisements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", sa.String(128), nullable=False),
        sa.Column("event_type", sa.Enum("REQUEST", "IMPRESSION", "START", "FIRST_QUARTILE", "MIDPOINT", "THIRD_QUARTILE", "COMPLETE", "SKIP", "ERROR", "CLICK", name="adeventtype"), nullable=False),
        sa.Column("session_id", sa.String(128), nullable=False),
        sa.Column("content_type", sa.String(50)),
        sa.Column("content_id", sa.String(50)),
        sa.Column("placement_type", sa.String(50)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("billable_amount", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("client_id", "event_id", name="uq_ad_event_client_event_id"),
    )
    for column in ("client_id", "advertisement_id", "event_type", "session_id"):
        op.create_index(f"ix_advertisement_events_{column}", "advertisement_events", [column])


def downgrade() -> None:
    op.drop_table("advertisement_events")
    op.alter_column(
        "advertisements",
        "starts_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(length=50),
        postgresql_using="starts_at::text",
    )
    op.alter_column(
        "advertisements",
        "ends_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.String(length=50),
        postgresql_using="ends_at::text",
    )
    sa.Enum(name="adeventtype").drop(op.get_bind(), checkfirst=True)