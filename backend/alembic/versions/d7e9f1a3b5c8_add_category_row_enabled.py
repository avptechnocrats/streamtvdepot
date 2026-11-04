"""Add category row visibility setting."""

from alembic import op
import sqlalchemy as sa

revision = "d7e9f1a3b5c8"
down_revision = "c7e9f1a3b5d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "content_categories",
        sa.Column("is_category_row_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("content_categories", "is_category_row_enabled")