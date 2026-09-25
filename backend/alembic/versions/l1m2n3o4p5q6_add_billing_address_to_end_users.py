"""add billing address fields to end_users

Revision ID: l1m2n3o4p5q6
Revises: k1l2m3n4o5p6
Create Date: 2026-05-14

"""
from alembic import op
import sqlalchemy as sa

revision: str = "l1m2n3o4p5q6"
down_revision: str = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("end_users", sa.Column("billing_line1", sa.String(255), nullable=True))
    op.add_column("end_users", sa.Column("billing_line2", sa.String(255), nullable=True))
    op.add_column("end_users", sa.Column("billing_city", sa.String(100), nullable=True))
    op.add_column("end_users", sa.Column("billing_state", sa.String(100), nullable=True))
    op.add_column("end_users", sa.Column("billing_postal_code", sa.String(20), nullable=True))
    op.add_column("end_users", sa.Column("billing_country", sa.String(2), nullable=True))


def downgrade() -> None:
    op.drop_column("end_users", "billing_country")
    op.drop_column("end_users", "billing_postal_code")
    op.drop_column("end_users", "billing_state")
    op.drop_column("end_users", "billing_city")
    op.drop_column("end_users", "billing_line2")
    op.drop_column("end_users", "billing_line1")
