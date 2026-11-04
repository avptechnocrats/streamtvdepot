"""Allow wider landscape category row cards."""

from alembic import op
import sqlalchemy as sa

revision = "e8f0a2c4d6b8"
down_revision = "d7e9f1a3b5c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_category_thumbnail_view", "content_categories", type_="check")
    op.alter_column(
        "content_categories",
        "thumbnail_view",
        existing_type=sa.String(length=10),
        type_=sa.String(length=20),
        existing_nullable=False,
        existing_server_default="landscape",
    )
    op.create_check_constraint(
        "ck_category_thumbnail_view",
        "content_categories",
        "thumbnail_view IN ('landscape', 'wider_landscape', 'portrait')",
    )


def downgrade() -> None:
    op.execute("UPDATE content_categories SET thumbnail_view = 'landscape' WHERE thumbnail_view = 'wider_landscape'")
    op.drop_constraint("ck_category_thumbnail_view", "content_categories", type_="check")
    op.alter_column(
        "content_categories",
        "thumbnail_view",
        existing_type=sa.String(length=20),
        type_=sa.String(length=10),
        existing_nullable=False,
        existing_server_default="landscape",
    )
    op.create_check_constraint(
        "ck_category_thumbnail_view",
        "content_categories",
        "thumbnail_view IN ('landscape', 'portrait')",
    )