"""Replace generic Audience permissions with workflow permissions.

Revision ID: i2j3k4l5m6n7
Revises: g1h2i3j4k5l6
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa


revision = "i2j3k4l5m6n7"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


AUDIENCE_PERMISSIONS = (
    ("audience.manage", "Manage Audience"),
    ("audience.subscriptions.view", "View Subscriptions"),
    ("audience.rent_ppv.view", "View Rents & PPVs"),
    ("audience.tickets.manage", "Manage Tickets"),
)


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "INSERT INTO client_permissions (code, module, description) "
            "VALUES (:code, 'Audience', :description) ON CONFLICT (code) DO NOTHING"
        ),
        [
            {"code": code, "description": description}
            for code, description in AUDIENCE_PERMISSIONS
        ],
    )
    connection.execute(
        sa.text(
            "INSERT INTO client_role_permissions (role_id, permission_code) "
            "SELECT DISTINCT crp.role_id, :new_permission "
            "FROM client_role_permissions crp "
            "WHERE crp.permission_code IN "
            "('audience.view', 'audience.create', 'audience.update', 'audience.delete') "
            "ON CONFLICT DO NOTHING"
        ),
        [{"new_permission": code} for code, _ in AUDIENCE_PERMISSIONS],
    )
    connection.execute(
        sa.text(
            "DELETE FROM client_permissions "
            "WHERE code IN ('audience.view', 'audience.create', 'audience.update', 'audience.delete')"
        )
    )


def downgrade() -> None:
    raise NotImplementedError("Audience workflow permissions cannot be safely collapsed")