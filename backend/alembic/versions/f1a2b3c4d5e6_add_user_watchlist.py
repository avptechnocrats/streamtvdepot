"""add user_watchlist table

Revision ID: f1a2b3c4d5e6
Revises: e5f7a9b1c234
Create Date: 2026-04-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "f1a2b3c4d5e6"
down_revision: str = "e5f7a9b1c234"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_watchlist (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id   UUID NOT NULL REFERENCES clients(id)    ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES end_users(id)  ON DELETE CASCADE,
            video_id    UUID NOT NULL,
            added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_watchlist_user_video UNIQUE (user_id, video_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_watchlist_client_id ON user_watchlist (client_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_watchlist_user_id   ON user_watchlist (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_watchlist_video_id  ON user_watchlist (video_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_watchlist")
