"""Add single-choice thumbnail orientation to content categories."""

from alembic import op
import sqlalchemy as sa

revision = "u2v3w4x5y6z7"
down_revision = "t0u1v2w3x4y5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "content_categories",
        sa.Column("thumbnail_view", sa.String(10), nullable=False, server_default="landscape"),
    )
    op.create_check_constraint(
        "ck_category_thumbnail_view",
        "content_categories",
        "thumbnail_view IN ('landscape', 'portrait')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_category_thumbnail_view", "content_categories", type_="check")
    op.drop_column("content_categories", "thumbnail_view")