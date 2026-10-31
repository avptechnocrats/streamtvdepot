"""Add optional destinations to managed banners."""

from alembic import op
import sqlalchemy as sa

revision = "k6l7m8n9o0p1"
down_revision = "j5k6l7m8n9o0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("client_banners", sa.Column("link", sa.String(2048), nullable=True))


def downgrade():
    op.drop_column("client_banners", "link")