"""Add tenant-scoped client-admin roles and permissions.

Revision ID: e0f1a2b3c4d5
Revises: f2a3b4c5d6e7
Create Date: 2026-09-15
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e0f1a2b3c4d5"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


PERMISSIONS = (
    ("access.roles.manage", "Access", "Create and manage roles and team access"),
    ("content.manage", "Content", "Manage all media and content operations"),
    ("marketing.manage", "Marketing", "Manage advertisements and coupons"),
    ("audience.manage", "Audience", "Manage end users, subscriptions, and tickets"),
    ("monetization.manage", "Monetization", "Manage pricing, transactions, and payment settings"),
    ("platform.manage", "Platform", "Manage themes, pages, and navigation"),
    ("reports.view", "Reports", "View business reports"),
)


def upgrade() -> None:
    op.create_table(
        "client_permissions",
        sa.Column("code", sa.String(length=100), primary_key=True),
        sa.Column("module", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
    )
    op.bulk_insert(
        sa.table(
            "client_permissions",
            sa.column("code", sa.String),
            sa.column("module", sa.String),
            sa.column("description", sa.String),
        ),
        [{"code": code, "module": module, "description": description} for code, module, description in PERMISSIONS],
    )
    op.create_table(
        "client_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255)),
        sa.Column("is_owner_role", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_system_role", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("client_id", "name", name="uq_client_roles_client_name"),
    )
    op.create_index("ix_client_roles_client_id", "client_roles", ["client_id"])
    op.create_table(
        "client_role_permissions",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("client_roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_code", sa.String(length=100), sa.ForeignKey("client_permissions.code", ondelete="CASCADE"), primary_key=True),
    )
    op.add_column("client_admin_users", sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_client_admin_users_role_id", "client_admin_users", "client_roles", ["role_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_client_admin_users_role_id", "client_admin_users", ["role_id"])

    connection = op.get_bind()
    existing_users = connection.execute(sa.text("SELECT id, client_id, role FROM client_admin_users")).mappings()
    roles: dict[tuple[uuid.UUID, str], uuid.UUID] = {}
    all_permission_codes = [code for code, _, _ in PERMISSIONS]
    for user in existing_users:
        legacy_role = str(user["role"])
        role_name = legacy_role.replace("_", " ").title()
        key = (user["client_id"], role_name)
        role_id = roles.get(key)
        if role_id is None:
            role_id = uuid.uuid4()
            roles[key] = role_id
            is_owner = legacy_role == "owner"
            connection.execute(
                sa.text("INSERT INTO client_roles (id, client_id, name, is_owner_role, is_system_role) VALUES (:id, :client_id, :name, :is_owner_role, true)"),
                {"id": role_id, "client_id": user["client_id"], "name": role_name, "is_owner_role": is_owner},
            )
            granted_permissions = all_permission_codes if legacy_role in {"owner", "admin"} else (
                ["content.manage", "reports.view"] if legacy_role == "editor" else ["reports.view"]
            )
            connection.execute(
                sa.text("INSERT INTO client_role_permissions (role_id, permission_code) VALUES (:role_id, :permission_code)"),
                [{"role_id": role_id, "permission_code": permission_code} for permission_code in granted_permissions],
            )
        connection.execute(
            sa.text("UPDATE client_admin_users SET role_id = :role_id WHERE id = :user_id"),
            {"role_id": role_id, "user_id": user["id"]},
        )


def downgrade() -> None:
    op.drop_index("ix_client_admin_users_role_id", table_name="client_admin_users")
    op.drop_constraint("fk_client_admin_users_role_id", "client_admin_users", type_="foreignkey")
    op.drop_column("client_admin_users", "role_id")
    op.drop_table("client_role_permissions")
    op.drop_index("ix_client_roles_client_id", table_name="client_roles")
    op.drop_table("client_roles")
    op.drop_table("client_permissions")