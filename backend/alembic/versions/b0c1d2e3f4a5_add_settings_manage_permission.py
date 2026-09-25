"""Add a dedicated Client-Admin settings permission.

Revision ID: b0c1d2e3f4a5
Revises: a0b1c2d3e4f5
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa


revision = "b0c1d2e3f4a5"
down_revision = "a0b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "INSERT INTO client_permissions (code, module, description) "
            "VALUES ('settings.manage', 'Settings', 'Manage general, email, and social sign-in settings')"
        )
    )
    connection.execute(
        sa.text(
            "INSERT INTO client_role_permissions (role_id, permission_code) "
            "SELECT DISTINCT cr.id, 'settings.manage' "
            "FROM client_roles cr "
            "JOIN client_admin_users au ON au.role_id = cr.id "
            "WHERE cr.is_system_role IS TRUE "
            "AND lower(au.role::text) = 'admin'"
        )
    )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text("DELETE FROM client_permissions WHERE code = 'settings.manage'")
    )