"""Fix permissions assigned to migrated legacy client-admin roles.

Revision ID: f0e1d2c3b4a5
Revises: e0f1a2b3c4d5
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa


revision = "f0e1d2c3b4a5"
down_revision = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()

    # Only reset roles created by the initial migration; tenant-created roles remain untouched.
    connection.execute(
        sa.text(
            "DELETE FROM client_role_permissions "
            "WHERE role_id IN (SELECT id FROM client_roles WHERE is_system_role IS TRUE)"
        )
    )
    connection.execute(
        sa.text(
            "INSERT INTO client_role_permissions (role_id, permission_code) "
            "SELECT DISTINCT cr.id, cp.code "
            "FROM client_roles cr "
            "JOIN client_admin_users au ON au.role_id = cr.id "
            "CROSS JOIN client_permissions cp "
            "WHERE cr.is_system_role IS TRUE "
            "AND lower(au.role::text) IN ('owner', 'admin')"
        )
    )
    connection.execute(
        sa.text(
            "INSERT INTO client_role_permissions (role_id, permission_code) "
            "SELECT DISTINCT cr.id, cp.code "
            "FROM client_roles cr "
            "JOIN client_admin_users au ON au.role_id = cr.id "
            "JOIN client_permissions cp ON cp.code IN ('content.manage', 'reports.view') "
            "WHERE cr.is_system_role IS TRUE "
            "AND lower(au.role::text) = 'editor'"
        )
    )
    connection.execute(
        sa.text(
            "INSERT INTO client_role_permissions (role_id, permission_code) "
            "SELECT DISTINCT cr.id, cp.code "
            "FROM client_roles cr "
            "JOIN client_admin_users au ON au.role_id = cr.id "
            "JOIN client_permissions cp ON cp.code = 'reports.view' "
            "WHERE cr.is_system_role IS TRUE "
            "AND lower(au.role::text) = 'viewer'"
        )
    )


def downgrade() -> None:
    # The prior grants cannot be recovered reliably; this migration is intentionally irreversible.
    pass