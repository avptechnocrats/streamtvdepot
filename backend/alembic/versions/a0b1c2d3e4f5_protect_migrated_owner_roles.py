"""Mark migrated owner roles as protected.

Revision ID: a0b1c2d3e4f5
Revises: f0e1d2c3b4a5
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa


revision = "a0b1c2d3e4f5"
down_revision = "f0e1d2c3b4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE client_roles AS cr "
            "SET is_owner_role = true, is_system_role = true "
            "FROM client_admin_users AS au "
            "WHERE au.role_id = cr.id AND lower(au.role::text) = 'owner'"
        )
    )


def downgrade() -> None:
    # Protection flags are intentionally retained after downgrade.
    pass