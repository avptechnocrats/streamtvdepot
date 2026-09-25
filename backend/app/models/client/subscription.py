import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class PlanBillingCycle(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    LIFETIME = "lifetime"


class PlanType(str, enum.Enum):
    SUBSCRIPTION = "subscription"
    PPV = "ppv"
    RENT = "rent"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    PAUSED = "paused"
    TRIAL = "trial"
    # Auto-renewal charge failed; access retained until grace_period_ends_at
    PAST_DUE = "past_due"
    GRACE_PERIOD = "grace_period"


class ClientSubscriptionPlan(Base, UUIDMixin, TimestampMixin):
    """Subscription plans a Client offers to their end users."""

    __tablename__ = "client_subscription_plans"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    billing_cycle: Mapped[PlanBillingCycle] = mapped_column(
        Enum(PlanBillingCycle),
        default=PlanBillingCycle.MONTHLY, nullable=False
    )
    plan_type: Mapped[PlanType] = mapped_column(
        Enum(PlanType, values_callable=lambda obj: [e.value for e in obj]),
        default=PlanType.SUBSCRIPTION, nullable=False
    )
    trial_days: Mapped[int] = mapped_column(Integer, default=0)
    trial_requires_active_payment_method: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    applies_to_all_content: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    applies_to_scope: Mapped[str] = mapped_column(String(30), default="content", nullable=False)
    applies_to_content_ids: Mapped[list | None] = mapped_column(JSONB)
    applies_to_category_ids: Mapped[list | None] = mapped_column(JSONB)
    max_screens: Mapped[int | None] = mapped_column(Integer)      # simultaneous streams
    max_downloads: Mapped[int | None] = mapped_column(Integer)
    can_download: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Access-time restrictions
    restriction_months: Mapped[int | None] = mapped_column(Integer)
    restriction_hours_per_day: Mapped[int | None] = mapped_column(Integer)
    restriction_days: Mapped[int | None] = mapped_column(Integer)
    # Per-country price overrides: [{country, price, currency}, ...]
    country_pricing: Mapped[list | None] = mapped_column(JSONB)


class UserSubscription(Base, UUIDMixin, TimestampMixin):
    """An end user's active subscription to a client plan."""

    __tablename__ = "user_subscriptions"
    __table_args__ = (
        Index(
            "ix_user_subscriptions_renewal_candidates",
            "expires_at",
            postgresql_where=text("auto_renew IS TRUE AND status IN ('active', 'trial')"),
        ),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("client_subscription_plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(
            SubscriptionStatus,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=SubscriptionStatus.ACTIVE,
        nullable=False,
    )
    started_at: Mapped[str] = mapped_column(String(50), nullable=False)
    expires_at: Mapped[str | None] = mapped_column(String(50))
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    cancelled_at: Mapped[str | None] = mapped_column(String(50))
    # For PPV (live-stream event) and Rent (video) — the specific content unlocked
    content_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Back-reference to the payment that funded this access
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )
    # Set when an auto-renewal charge fails; access is retained until this time
    grace_period_ends_at: Mapped[str | None] = mapped_column(String(50))
    # Comma-separated reminder/escalation day markers already sent, e.g. "14,7,3"
    reminder_sent_days: Mapped[str | None] = mapped_column(String(50))
    # Tracks whether the active subscription was granted by the end user or the system.
    executed_by: Mapped[str] = mapped_column(String(20), default="User", nullable=False)


class UserSubscriptionRenewalAudit(Base, UUIDMixin, TimestampMixin):
    """Immutable per-attempt audit trail for end-user renewal outcomes."""

    __tablename__ = "user_subscription_renewal_audits"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_subscription_plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(
            SubscriptionStatus,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        index=True,
    )
    outcome: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    failure_reason: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    failure_detail: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    gateway_transaction_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)
