"""Add category-only visibility flag to videos."""

from alembic import op
import sqlalchemy as sa

revision = "c7e9f1a3b5d7"
down_revision = "u2v3w4x5y6z7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "content_videos",
        sa.Column("is_category_only", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("content_videos", "is_category_only")