"""Add usage alerts and notification logs tables

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-06-23 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "c4d5e6f7a8b9"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    metric_enum = postgresql.ENUM(
        "bandwidth",
        "storage",
        "encoding",
        "api_calls",
        name="alertmetrictype",
        create_type=False,
    )
    threshold_enum = postgresql.ENUM(
        "at_risk",
        "over_limit",
        "critical",
        name="alertthresholdtype",
        create_type=False,
    )
    status_enum = postgresql.ENUM(
        "active",
        "resolved",
        "acknowledged",
        name="alertstatus",
        create_type=False,
    )

    # Create enum types safely if they do not exist.
    metric_enum.create(bind, checkfirst=True)
    threshold_enum.create(bind, checkfirst=True)
    status_enum.create(bind, checkfirst=True)

    # Create usage_alerts table if missing.
    if not inspector.has_table("usage_alerts"):
        op.create_table(
            "usage_alerts",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("billing_year", sa.Integer(), nullable=False),
            sa.Column("billing_month", sa.Integer(), nullable=False),
            sa.Column("metric_type", metric_enum, nullable=False),
            sa.Column("threshold_type", threshold_enum, nullable=False),
            sa.Column("status", status_enum, nullable=False, server_default="active"),
            sa.Column("current_usage", sa.Float(), nullable=False),
            sa.Column("plan_limit", sa.Float(), nullable=True),
            sa.Column("usage_percentage", sa.Float(), nullable=False),
            sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("acknowledged_by", sa.String(255), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.Index("ix_usage_alerts_client_id", "client_id"),
        )

    # Create alert_notification_logs table if missing.
    if not inspector.has_table("alert_notification_logs"):
        op.create_table(
            "alert_notification_logs",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("alert_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("recipient_email", sa.String(255), nullable=False),
            sa.Column("recipient_type", sa.String(50), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("delivery_status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["alert_id"], ["usage_alerts.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.Index("ix_alert_notification_logs_alert_id", "alert_id"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    metric_enum = postgresql.ENUM(
        "bandwidth",
        "storage",
        "encoding",
        "api_calls",
        name="alertmetrictype",
        create_type=False,
    )
    threshold_enum = postgresql.ENUM(
        "at_risk",
        "over_limit",
        "critical",
        name="alertthresholdtype",
        create_type=False,
    )
    status_enum = postgresql.ENUM(
        "active",
        "resolved",
        "acknowledged",
        name="alertstatus",
        create_type=False,
    )

    if inspector.has_table("alert_notification_logs"):
        op.drop_table("alert_notification_logs")
    if inspector.has_table("usage_alerts"):
        op.drop_table("usage_alerts")
    status_enum.drop(bind, checkfirst=True)
    threshold_enum.drop(bind, checkfirst=True)
    metric_enum.drop(bind, checkfirst=True)
