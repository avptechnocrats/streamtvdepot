from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class SaasSubscriptionPlan(Base, UUIDMixin, TimestampMixin):
    """Plans that SuperAdmin offers to Clients."""

    __tablename__ = "saas_subscription_plans"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sub_text: Mapped[str | None] = mapped_column(String(500))
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    # Per-billing-cycle pricing (amount per month for each cycle)
    price_monthly: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    price_quarterly: Mapped[float | None] = mapped_column(Numeric(10, 2))
    price_yearly: Mapped[float | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    # Key features — list of strings stored as JSON
    key_features: Mapped[list | None] = mapped_column(JSONB, default=list)
    # Additional app platforms — e.g. {"android": true, "ios": false, ...}
    additional_apps: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    additional_app_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    # Limits
    max_users: Mapped[int | None] = mapped_column(Integer)
    max_storage_gb: Mapped[int | None] = mapped_column(Integer)
    max_streams: Mapped[int | None] = mapped_column(Integer)
    max_admin_users: Mapped[int | None] = mapped_column(Integer)
    bandwidth_gb_monthly: Mapped[int | None] = mapped_column(Integer)
    encoding_minutes_monthly: Mapped[int | None] = mapped_column(Integer)
    api_calls_per_month: Mapped[int | None] = mapped_column(Integer)
    concurrent_users_peak: Mapped[int | None] = mapped_column(Integer)
    simultaneous_uploads: Mapped[int] = mapped_column(Integer, default=1)
    # Overage Pricing
    overage_bandwidth_per_gb: Mapped[float | None] = mapped_column(Numeric(10, 4))
    overage_storage_per_gb: Mapped[float | None] = mapped_column(Numeric(10, 4))
    overage_encoding_per_minute: Mapped[float | None] = mapped_column(Numeric(10, 4))
    overage_api_per_1m_calls: Mapped[float | None] = mapped_column(Numeric(10, 4))
    # Content Restrictions
    allowed_content_types: Mapped[list | None] = mapped_column(JSONB, default=list)
    max_bitrate_mbps: Mapped[int | None] = mapped_column(Integer)
    content_retention_days: Mapped[int] = mapped_column(Integer, default=365)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_trial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Soft delete
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client_subscriptions: Mapped[list["ClientSubscription"]] = relationship(
        back_populates="plan",
        foreign_keys="[ClientSubscription.plan_id]",
    )
    pending_downgrade_client_subscriptions: Mapped[list["ClientSubscription"]] = relationship(
        back_populates="pending_downgrade_plan",
        foreign_keys="[ClientSubscription.pending_downgrade_plan_id]",
    )
