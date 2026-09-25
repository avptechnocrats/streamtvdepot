"""add user subscription renewal audits table

Revision ID: f4d4b8e8a1c2
Revises: b9c0d1e2f3a5
Create Date: 2026-09-04

"""

from alembic import op
import sqlalchemy as sa


revision: str = "f4d4b8e8a1c2"
down_revision: str = "b9c0d1e2f3a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE subscriptionstatus AS ENUM ('active', 'expired', 'cancelled', 'paused', 'trial', 'past_due'); EXCEPTION WHEN duplicate_object THEN null; END $$"
    ))

    op.execute(sa.text("""
        ALTER TABLE user_subscriptions
            ADD COLUMN IF NOT EXISTS executed_by VARCHAR(20) NOT NULL DEFAULT 'User'
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS user_subscription_renewal_audits (
            id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id                UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            user_id                  UUID NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
            subscription_id          UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
            plan_id                  UUID NOT NULL REFERENCES client_subscription_plans(id) ON DELETE RESTRICT,
            status                   subscriptionstatus NOT NULL,
            outcome                  VARCHAR(40) NOT NULL DEFAULT 'failed',
            failure_reason           VARCHAR(120),
            failure_detail           TEXT,
            provider                 VARCHAR(30),
            gateway_transaction_id   VARCHAR(200),
            metadata_json            JSONB,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_client_id ON user_subscription_renewal_audits(client_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_user_id ON user_subscription_renewal_audits(user_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_subscription_id ON user_subscription_renewal_audits(subscription_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_plan_id ON user_subscription_renewal_audits(plan_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_status ON user_subscription_renewal_audits(status)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_outcome ON user_subscription_renewal_audits(outcome)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_failure_reason ON user_subscription_renewal_audits(failure_reason)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_user_subscription_renewal_audits_provider ON user_subscription_renewal_audits(provider)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS user_subscription_renewal_audits"))
    op.execute(sa.text("DO $$ BEGIN DROP TYPE IF EXISTS subscriptionstatus; END $$"))
