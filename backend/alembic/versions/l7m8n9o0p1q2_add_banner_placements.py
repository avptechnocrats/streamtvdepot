"""Allow managed banners to target multiple page/position pairs."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "l7m8n9o0p1q2"
down_revision = "e8f0a2c4d6b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "client_banners",
        sa.Column("placements", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.execute(
        "UPDATE client_banners SET placements = jsonb_build_array(jsonb_build_object('page', page, 'position', position))"
    )
    op.create_index(
        "ix_client_banners_placements",
        "client_banners",
        ["placements"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_client_banners_placements", table_name="client_banners")
    op.drop_column("client_banners", "placements")