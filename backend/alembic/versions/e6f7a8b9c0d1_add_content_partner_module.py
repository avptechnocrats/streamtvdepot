"""Add tenant content partners and revenue ledger.

Revision ID: e6f7a8b9c0d1
Revises: d0e1f2a3b4c5
Create Date: 2026-09-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e6f7a8b9c0d1"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_partners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("legal_name", sa.String(255)),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("contact_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("subscription_share_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("rental_share_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("ppv_share_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("settlement_currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_content_partners_client_id", "content_partners", ["client_id"])
    op.create_index("ix_content_partners_status", "content_partners", ["status"])
    op.add_column("client_admin_users", sa.Column("content_partner_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_client_admin_users_content_partner", "client_admin_users", "content_partners", ["content_partner_id"], ["id"], ondelete="CASCADE")
    op.create_unique_constraint("uq_client_admin_users_content_partner", "client_admin_users", ["content_partner_id"])
    op.create_index("ix_client_admin_users_content_partner_id", "client_admin_users", ["content_partner_id"])
    op.add_column("content_videos", sa.Column("partner_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_content_videos_partner", "content_videos", "content_partners", ["partner_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_content_videos_partner_id", "content_videos", ["partner_id"])
    op.create_table(
        "partner_revenue_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("partner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("content_partners.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payments.id", ondelete="RESTRICT")),
        sa.Column("content_id", postgresql.UUID(as_uuid=True)),
        sa.Column("revenue_type", sa.String(20), nullable=False),
        sa.Column("reporting_period", sa.String(7)),
        sa.Column("gross_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("share_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("partner_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("settled_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("payment_id", name="uq_partner_revenue_ledger_payment_id"),
    )
    op.create_index("ix_partner_revenue_ledger_client_id", "partner_revenue_ledger", ["client_id"])
    op.create_index("ix_partner_revenue_ledger_partner_id", "partner_revenue_ledger", ["partner_id"])
    op.create_index("ix_partner_revenue_ledger_content_id", "partner_revenue_ledger", ["content_id"])
    op.create_index("ix_partner_revenue_ledger_status", "partner_revenue_ledger", ["status"])


def downgrade() -> None:
    op.drop_table("partner_revenue_ledger")
    op.drop_index("ix_content_videos_partner_id", table_name="content_videos")
    op.drop_constraint("fk_content_videos_partner", "content_videos", type_="foreignkey")
    op.drop_column("content_videos", "partner_id")
    op.drop_index("ix_client_admin_users_content_partner_id", table_name="client_admin_users")
    op.drop_constraint("uq_client_admin_users_content_partner", "client_admin_users", type_="unique")
    op.drop_constraint("fk_client_admin_users_content_partner", "client_admin_users", type_="foreignkey")
    op.drop_column("client_admin_users", "content_partner_id")
    op.drop_table("content_partners")