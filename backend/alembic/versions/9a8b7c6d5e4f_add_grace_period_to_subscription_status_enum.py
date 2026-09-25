"""add_grace_period_to_subscription_status_enum

Adds the missing grace_period value to the shared Postgres enum used by
ClientSubscription and UserSubscription status fields.

Revision ID: 9a8b7c6d5e4f
Revises: a9f2d7c3b4e1
Create Date: 2026-09-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9a8b7c6d5e4f"
down_revision: Union[str, None] = "a9f2d7c3b4e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STATUS_TABLES = ("client_subscriptions", "user_subscriptions", "user_subscription_renewal_audits")
# SQLAlchemy originally stored Python enum *names* (uppercase); values_callable
# now maps to lowercase .value, so legacy rows/labels must be normalized too.
LEGACY_TO_VALUE = (
    ("ACTIVE", "active"),
    ("EXPIRED", "expired"),
    ("CANCELLED", "cancelled"),
    ("PAUSED", "paused"),
    ("TRIAL", "trial"),
    ("PAST_DUE", "past_due"),
)


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_type t
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE t.typname = 'subscriptionstatus'
                      AND n.nspname = current_schema()
                ) THEN
                    CREATE TYPE subscriptionstatus AS ENUM (
                        'active', 'expired', 'cancelled', 'paused', 'trial', 'past_due', 'grace_period'
                    );
                END IF;
            END $$;
            """
        )
    )

    # Convert any remaining varchar status columns to the enum type.
    for table in ("client_subscriptions", "user_subscriptions"):
        op.execute(
            sa.text(
                f"""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = '{table}'
                          AND column_name = 'status'
                          AND data_type = 'character varying'
                    ) THEN
                        ALTER TABLE {table}
                            ALTER COLUMN status TYPE subscriptionstatus
                            USING CASE lower(status::text)
                                WHEN 'active' THEN 'active'::subscriptionstatus
                                WHEN 'expired' THEN 'expired'::subscriptionstatus
                                WHEN 'cancelled' THEN 'cancelled'::subscriptionstatus
                                WHEN 'paused' THEN 'paused'::subscriptionstatus
                                WHEN 'trial' THEN 'trial'::subscriptionstatus
                                WHEN 'past_due' THEN 'past_due'::subscriptionstatus
                                WHEN 'grace_period' THEN 'grace_period'::subscriptionstatus
                                ELSE NULL
                            END;
                    END IF;
                END $$;
                """
            )
        )

    # Normalize any rows still holding legacy uppercase enum labels.
    for table in STATUS_TABLES:
        for legacy, value in LEGACY_TO_VALUE:
            op.execute(
                sa.text(
                    f"""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = current_schema()
                              AND table_name = '{table}'
                              AND column_name = 'status'
                        ) THEN
                            UPDATE {table} SET status = '{value}'::subscriptionstatus
                            WHERE status::text = '{legacy}';
                        END IF;
                    END $$;
                    """
                )
            )

    # Rebuild the enum type to drop the legacy uppercase labels entirely,
    # once no row references them.
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON e.enumtypid = t.oid
                    WHERE t.typname = 'subscriptionstatus' AND e.enumlabel = 'ACTIVE'
                ) THEN
                    CREATE TYPE subscriptionstatus_clean AS ENUM (
                        'active', 'expired', 'cancelled', 'paused', 'trial', 'past_due', 'grace_period'
                    );

                    ALTER TABLE client_subscriptions
                        ALTER COLUMN status TYPE subscriptionstatus_clean
                        USING status::text::subscriptionstatus_clean;
                    ALTER TABLE user_subscriptions
                        ALTER COLUMN status TYPE subscriptionstatus_clean
                        USING status::text::subscriptionstatus_clean;
                    ALTER TABLE user_subscription_renewal_audits
                        ALTER COLUMN status TYPE subscriptionstatus_clean
                        USING status::text::subscriptionstatus_clean;

                    DROP TYPE subscriptionstatus;
                    ALTER TYPE subscriptionstatus_clean RENAME TO subscriptionstatus;
                END IF;
            END $$;
            """
        )
    )


def downgrade() -> None:
    # PostgreSQL does not support removing enum values in-place.
    # The downgrade is intentionally a no-op because this schema change is
    # additive and preserves the runtime status semantics.
    pass
