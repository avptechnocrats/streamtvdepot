"""add_plan_type_to_client_subscription_plans

Revision ID: a1d3e7f924bc
Revises: 68344d2921de
Create Date: 2026-04-14 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1d3e7f924bc"
down_revision: Union[str, None] = "68344d2921de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Clean up any partial state from previous failed attempts
    conn.execute(sa.text(
        "ALTER TABLE client_subscription_plans DROP COLUMN IF EXISTS plan_type"
    ))
    conn.execute(sa.text("DROP TYPE IF EXISTS plantype"))

    # 2. Create the enum type
    conn.execute(sa.text(
        "CREATE TYPE plantype AS ENUM ('subscription', 'ppv', 'rent')"
    ))

    # 3. Add column as nullable with NO DEFAULT — asyncpg fails when a string
    #    literal appears in the DEFAULT clause of a prepared DDL statement.
    conn.execute(sa.text(
        "ALTER TABLE client_subscription_plans ADD COLUMN plan_type plantype"
    ))

    # 4. Back-fill existing rows
    conn.execute(sa.text(
        "UPDATE client_subscription_plans SET plan_type = 'subscription'::plantype"
    ))

    # 5. Now safe to set NOT NULL and the permanent default
    conn.execute(sa.text(
        "ALTER TABLE client_subscription_plans "
        "ALTER COLUMN plan_type SET NOT NULL, "
        "ALTER COLUMN plan_type SET DEFAULT 'subscription'::plantype"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE client_subscription_plans DROP COLUMN IF EXISTS plan_type"
    ))
    conn.execute(sa.text("DROP TYPE IF EXISTS plantype"))
