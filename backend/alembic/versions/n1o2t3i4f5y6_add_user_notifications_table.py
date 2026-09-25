"""Add user_notifications table

Revision ID: n1o2t3i4f5y6
Revises: y3z4a5b6c7d8
Create Date: 2026-08-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "n1o2t3i4f5y6"
down_revision: Union[str, None] = "48d97f656265"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # notificationtype enum is created by the model import on first startup if absent;
    # create the table referencing it via raw SQL to avoid SQLAlchemy auto-create conflicts.
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_notifications (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES end_users(id) ON DELETE CASCADE,
            type        notificationtype NOT NULL,
            title       VARCHAR(255) NOT NULL,
            body        TEXT NOT NULL,
            action_url  VARCHAR(500),
            image_url   TEXT,
            is_read     BOOLEAN NOT NULL DEFAULT false,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_client_id ON user_notifications (client_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_user_id   ON user_notifications (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_type      ON user_notifications (type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_is_read   ON user_notifications (is_read)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_notifications")
    op.execute("DROP TYPE IF EXISTS notificationtype")


def upgrade() -> None:
    op.execute(
        "CREATE TYPE IF NOT EXISTS notificationtype AS ENUM "
        "('new_content','subscription_renewal','subscription_expiry','rental_expiry',"
        "'payment_success','payment_failed','promotional','system')"
    )
    op.create_table(
        "user_notifications",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.Enum(name="notificationtype", create_type=False), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("action_url", sa.String(500), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["end_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_notifications_client_id", "user_notifications", ["client_id"])
    op.create_index("ix_user_notifications_user_id", "user_notifications", ["user_id"])
    op.create_index("ix_user_notifications_type", "user_notifications", ["type"])
    op.create_index("ix_user_notifications_is_read", "user_notifications", ["is_read"])


def downgrade() -> None:
    op.drop_index("ix_user_notifications_is_read", table_name="user_notifications")
    op.drop_index("ix_user_notifications_type", table_name="user_notifications")
    op.drop_index("ix_user_notifications_user_id", table_name="user_notifications")
    op.drop_index("ix_user_notifications_client_id", table_name="user_notifications")
    op.drop_table("user_notifications")
    op.execute("DROP TYPE IF EXISTS notificationtype")
