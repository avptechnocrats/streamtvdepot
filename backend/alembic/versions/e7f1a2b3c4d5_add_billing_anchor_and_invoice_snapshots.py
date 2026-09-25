"""add billing anchors and immutable invoice snapshots

Revision ID: e7f1a2b3c4d5
Revises: d4e6f8b0c123, c4d5e6f7a8b9
Create Date: 2026-06-23 17:30:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "e7f1a2b3c4d5"
down_revision = ("d4e6f8b0c123", "c4d5e6f7a8b9")
branch_labels = None
depends_on = None


def _columns_by_name(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {col["name"] for col in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def _fk_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {fk.get("name") for fk in inspector.get_foreign_keys(table_name) if fk.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("client_subscriptions"):
        subscription_columns = _columns_by_name(inspector, "client_subscriptions")

        if "billing_cycle_anchor_day" not in subscription_columns:
            op.add_column(
                "client_subscriptions",
                sa.Column("billing_cycle_anchor_day", sa.Integer(), nullable=False, server_default="1"),
            )
        if "billing_timezone" not in subscription_columns:
            op.add_column(
                "client_subscriptions",
                sa.Column("billing_timezone", sa.String(length=100), nullable=False, server_default="UTC"),
            )
        if "next_invoice_at" not in subscription_columns:
            op.add_column(
                "client_subscriptions",
                sa.Column("next_invoice_at", sa.String(length=50), nullable=True),
            )

    if inspector.has_table("saas_billing"):
        billing_columns = _columns_by_name(inspector, "saas_billing")
        billing_indexes = _index_names(inspector, "saas_billing")
        billing_fks = _fk_names(inspector, "saas_billing")

        if "period_year" not in billing_columns:
            op.add_column("saas_billing", sa.Column("period_year", sa.Integer(), nullable=True))
        if "period_month" not in billing_columns:
            op.add_column("saas_billing", sa.Column("period_month", sa.Integer(), nullable=True))
        if "usage_record_id" not in billing_columns:
            op.add_column(
                "saas_billing",
                sa.Column("usage_record_id", postgresql.UUID(as_uuid=True), nullable=True),
            )
        if "plan_snapshot" not in billing_columns:
            op.add_column("saas_billing", sa.Column("plan_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        if "usage_snapshot" not in billing_columns:
            op.add_column("saas_billing", sa.Column("usage_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        if "subtotal" not in billing_columns:
            op.add_column(
                "saas_billing",
                sa.Column("subtotal", sa.Numeric(precision=12, scale=2), nullable=False, server_default=sa.text("0")),
            )
        if "overage_total" not in billing_columns:
            op.add_column(
                "saas_billing",
                sa.Column("overage_total", sa.Numeric(precision=12, scale=2), nullable=False, server_default=sa.text("0")),
            )
        if "discount_amount" not in billing_columns:
            op.add_column(
                "saas_billing",
                sa.Column("discount_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default=sa.text("0")),
            )
        if "tax_amount" not in billing_columns:
            op.add_column(
                "saas_billing",
                sa.Column("tax_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default=sa.text("0")),
            )
        if "total_due" not in billing_columns:
            op.add_column(
                "saas_billing",
                sa.Column("total_due", sa.Numeric(precision=12, scale=2), nullable=False, server_default=sa.text("0")),
            )
        if "proration_factor" not in billing_columns:
            op.add_column(
                "saas_billing",
                sa.Column("proration_factor", sa.Numeric(precision=8, scale=6), nullable=False, server_default=sa.text("1")),
            )
        if "active_days" not in billing_columns:
            op.add_column("saas_billing", sa.Column("active_days", sa.Integer(), nullable=True))
        if "billing_days" not in billing_columns:
            op.add_column("saas_billing", sa.Column("billing_days", sa.Integer(), nullable=True))
        if "finalized_at" not in billing_columns:
            op.add_column("saas_billing", sa.Column("finalized_at", sa.String(length=50), nullable=True))

        if "ix_saas_billing_period_year_period_month" not in billing_indexes:
            op.create_index(
                "ix_saas_billing_period_year_period_month",
                "saas_billing",
                ["period_year", "period_month"],
                unique=False,
            )

        if "fk_saas_billing_usage_record_id" not in billing_fks:
            op.create_foreign_key(
                "fk_saas_billing_usage_record_id",
                "saas_billing",
                "client_monthly_usage",
                ["usage_record_id"],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("saas_billing"):
        billing_columns = _columns_by_name(inspector, "saas_billing")
        billing_indexes = _index_names(inspector, "saas_billing")
        billing_fks = _fk_names(inspector, "saas_billing")

        if "fk_saas_billing_usage_record_id" in billing_fks:
            op.drop_constraint("fk_saas_billing_usage_record_id", "saas_billing", type_="foreignkey")

        if "ix_saas_billing_period_year_period_month" in billing_indexes:
            op.drop_index("ix_saas_billing_period_year_period_month", table_name="saas_billing")

        for column_name in [
            "finalized_at",
            "billing_days",
            "active_days",
            "proration_factor",
            "total_due",
            "tax_amount",
            "discount_amount",
            "overage_total",
            "subtotal",
            "usage_snapshot",
            "plan_snapshot",
            "usage_record_id",
            "period_month",
            "period_year",
        ]:
            if column_name in billing_columns:
                op.drop_column("saas_billing", column_name)

    if inspector.has_table("client_subscriptions"):
        subscription_columns = _columns_by_name(inspector, "client_subscriptions")
        for column_name in ["next_invoice_at", "billing_timezone", "billing_cycle_anchor_day"]:
            if column_name in subscription_columns:
                op.drop_column("client_subscriptions", column_name)
