import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class AlertThresholdType(str, enum.Enum):
    """Alert trigger thresholds."""
    AT_RISK = "at_risk"          # 80% of limit
    OVER_LIMIT = "over_limit"    # 100% of limit
    CRITICAL = "critical"        # 110% of limit


class AlertMetricType(str, enum.Enum):
    """Which metric triggered the alert."""
    BANDWIDTH = "bandwidth"
    STORAGE = "storage"
    ENCODING = "encoding"
    API_CALLS = "api_calls"


class AlertStatus(str, enum.Enum):
    """Alert resolution status."""
    ACTIVE = "active"
    RESOLVED = "resolved"
    ACKNOWLEDGED = "acknowledged"


class UsageAlert(Base, UUIDMixin, TimestampMixin):
    """Alert fired when usage hits a threshold."""

    __tablename__ = "usage_alerts"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    billing_year: Mapped[int] = mapped_column(nullable=False)
    billing_month: Mapped[int] = mapped_column(nullable=False)

    # What and why
    metric_type: Mapped[AlertMetricType] = mapped_column(Enum(AlertMetricType), nullable=False)
    threshold_type: Mapped[AlertThresholdType] = mapped_column(Enum(AlertThresholdType), nullable=False)
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus), default=AlertStatus.ACTIVE, nullable=False)

    # Trigger context
    current_usage: Mapped[float] = mapped_column(Float, nullable=False)
    plan_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    usage_percentage: Mapped[float] = mapped_column(Float, nullable=False)

    # Notification
    notified_at: Mapped[datetime | None] = mapped_column(nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(255), nullable=True)  # email
    resolved_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # Relationships
    client: Mapped["Client"] = relationship("Client")  # type: ignore


class AlertNotificationLog(Base, UUIDMixin, TimestampMixin):
    """Log of all notifications sent for alerts."""

    __tablename__ = "alert_notification_logs"

    alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("usage_alerts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_type: Mapped[str] = mapped_column(String(50), nullable=False)  # superadmin, client_admin, end_user
    sent_at: Mapped[datetime | None] = mapped_column(nullable=True)
    delivery_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending, sent, failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(nullable=True)

    alert: Mapped["UsageAlert"] = relationship("UsageAlert")  # type: ignore
