"""Normalize the Cashfree payment method enum casing used by SQLAlchemy.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
"""

from alembic import op


revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'paymentmethod'::regtype AND enumlabel = 'cashfree'
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'paymentmethod'::regtype AND enumlabel = 'CASHFREE'
            ) THEN
                ALTER TYPE paymentmethod RENAME VALUE 'cashfree' TO 'CASHFREE';
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    # PostgreSQL cannot remove enum values without rebuilding the type.
    pass