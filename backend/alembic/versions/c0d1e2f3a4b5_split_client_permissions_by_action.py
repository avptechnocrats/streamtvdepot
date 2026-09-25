"""Split Client-Admin module permissions into action-level grants.

Revision ID: c0d1e2f3a4b5
Revises: b0c1d2e3f4a5
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa


revision = "c0d1e2f3a4b5"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


MODULES = (
    ("content", "Content"),
    ("marketing", "Marketing"),
    ("audience", "Audience"),
    ("monetization", "Monetization"),
    ("platform", "Platform"),
)
ACTIONS = (
    ("view", "View"),
    ("create", "Add"),
    ("update", "Edit"),
    ("delete", "Delete"),
)


def upgrade() -> None:
    connection = op.get_bind()
    permissions = [
        {
            "code": f"{module}.{action}",
            "module": module_name,
            "description": f"{label} {module_name.lower()}",
        }
        for module, module_name in MODULES
        for action, label in ACTIONS
    ] + [
        {"code": "settings.view", "module": "Settings", "description": "View general settings"},
        {"code": "settings.update", "module": "Settings", "description": "Edit general settings"},
    ]
    connection.execute(
        sa.text(
            "INSERT INTO client_permissions (code, module, description) "
            "VALUES (:code, :module, :description)"
        ),
        permissions,
    )
    for module, _ in MODULES:
        connection.execute(
            sa.text(
                "INSERT INTO client_role_permissions (role_id, permission_code) "
                "SELECT role_id, :new_permission "
                "FROM client_role_permissions "
                "WHERE permission_code = :old_permission"
            ),
            [
                {
                    "new_permission": f"{module}.{action}",
                    "old_permission": f"{module}.manage",
                }
                for action, _ in ACTIONS
            ],
        )
    connection.execute(
        sa.text(
            "INSERT INTO client_role_permissions (role_id, permission_code) "
            "SELECT role_id, :new_permission "
            "FROM client_role_permissions "
            "WHERE permission_code = 'settings.manage'"
        ),
        [{"new_permission": "settings.view"}, {"new_permission": "settings.update"}],
    )
    connection.execute(
        sa.text(
            "DELETE FROM client_permissions "
            "WHERE code IN ('content.manage', 'marketing.manage', 'audience.manage', "
            "'monetization.manage', 'platform.manage', 'settings.manage')"
        )
    )


def downgrade() -> None:
    raise NotImplementedError("Action-level role permissions cannot be safely collapsed")