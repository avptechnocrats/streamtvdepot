"""Add reusable Content Partner roles.

Revision ID: j2k3l4m5n6o7
Revises: i2j3k4l5m6n7
Create Date: 2026-09-18
"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "j2k3l4m5n6o7"
down_revision = "i2j3k4l5m6n7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    client_ids = connection.execute(sa.text("SELECT id FROM clients")).scalars().all()
    permission_codes = ("content.view", "content.create", "content.update")

    for client_id in client_ids:
        role_id = connection.execute(
            sa.text(
                "SELECT id FROM client_roles "
                "WHERE client_id = :client_id AND name = 'Content Partner'"
            ),
            {"client_id": client_id},
        ).scalar_one_or_none()
        if role_id is None:
            role_id = uuid.uuid4()
            connection.execute(
                sa.text(
                    "INSERT INTO client_roles "
                    "(id, client_id, name, description, is_owner_role, is_system_role, created_at, updated_at) "
                    "VALUES (:id, :client_id, 'Content Partner', "
                    "'Catalog upload access scoped to the assigned content partner', "
                    "false, false, NOW(), NOW())"
                ),
                {"id": role_id, "client_id": client_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO client_role_permissions (role_id, permission_code) "
                    "VALUES (:role_id, :permission_code) ON CONFLICT DO NOTHING"
                ),
                [
                    {"role_id": role_id, "permission_code": permission_code}
                    for permission_code in permission_codes
                ],
            )

        connection.execute(
            sa.text(
                "UPDATE client_admin_users SET role_id = :role_id "
                "WHERE client_id = :client_id AND content_partner_id IS NOT NULL"
            ),
            {"role_id": role_id, "client_id": client_id},
        )

    connection.execute(
        sa.text(
            "DELETE FROM client_roles "
            "WHERE name LIKE 'Content Partner %' AND name <> 'Content Partner'"
        )
    )


def downgrade() -> None:
    raise NotImplementedError("Content partner accounts cannot be safely restored to generated roles")