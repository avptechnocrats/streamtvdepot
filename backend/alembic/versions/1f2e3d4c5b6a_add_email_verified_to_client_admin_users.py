"""add email verified to client admin users

Revision ID: 1f2e3d4c5b6a
Revises: t9u8v7w6x5y4
Create Date: 2026-07-09

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1f2e3d4c5b6a"
down_revision: Union[str, Sequence[str], None] = "t9u8v7w6x5y4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_admin_users",
        sa.Column("is_email_verified", sa.Boolean(), nullable=True),
    )

    # Keep all existing admins active for login; only new client self-signups require verification.
    op.execute("UPDATE client_admin_users SET is_email_verified = TRUE WHERE is_email_verified IS NULL")

    op.alter_column(
        "client_admin_users",
        "is_email_verified",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text("false"),
    )


def downgrade() -> None:
    op.drop_column("client_admin_users", "is_email_verified")
