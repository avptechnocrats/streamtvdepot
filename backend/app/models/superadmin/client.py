import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ClientStatus(str, enum.Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    PAUSED = "paused"
    TRIAL = "trial"
    PAST_DUE = "past_due"
    GRACE_PERIOD = "grace_period"


class Client(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "clients"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    domain: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    """Primary domain for this client's storefront (e.g. 'kalingo.tv')."""
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(255))
    logo_url: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(100), default="UTC", nullable=False)
    theme_config: Mapped[dict | None] = mapped_column(JSONB)
    """Client branding: primary_color, font, logo_url, favicon_url, etc."""
    site_config: Mapped[dict | None] = mapped_column(JSONB)
    """Site-level settings: site_title, tagline, site_language, logo_s3_key, SMTP config, etc."""
    status: Mapped[ClientStatus] = mapped_column(
        Enum(ClientStatus), default=ClientStatus.TRIAL, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Stored after first successful Stripe payment to enable off-session auto-charge
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Stored after first successful PayPal payment to enable off-session auto-charge via Vault API
    paypal_vault_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    subscription: Mapped["ClientSubscription"] = relationship(
        back_populates="client", uselist=False, cascade="all, delete-orphan"
    )
    modules: Mapped[list["ClientModule"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )


"""
Links a Client to a SaaS subscription plan (managed by SuperAdmin).
"""
class ClientSubscription(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "client_subscriptions"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("saas_subscription_plans.id", ondelete="RESTRICT"),
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
    started_at: Mapped[str | None] = mapped_column(String(50))
    expires_at: Mapped[str | None] = mapped_column(String(50))
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly", nullable=False)
    billing_cycle_anchor_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    billing_timezone: Mapped[str] = mapped_column(String(100), default="UTC", nullable=False)
    next_invoice_at: Mapped[str | None] = mapped_column(String(50))
    # Scheduled downgrade: applied automatically at the next renewal
    pending_downgrade_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("saas_subscription_plans.id", ondelete="SET NULL"),
        nullable=True,
    )
    pending_downgrade_requested_at: Mapped[str | None] = mapped_column(String(50))
    # Set when subscription enters past_due or grace_period status
    grace_period_ends_at: Mapped[str | None] = mapped_column(String(50))
    # Comma-separated days already notified, e.g. "14,7,3"
    reminder_sent_days: Mapped[str | None] = mapped_column(String(50))

    client: Mapped["Client"] = relationship(back_populates="subscription")
    plan: Mapped["SaasSubscriptionPlan"] = relationship(
        back_populates="client_subscriptions",
        foreign_keys="[ClientSubscription.plan_id]",
    )
    pending_downgrade_plan: Mapped["SaasSubscriptionPlan | None"] = relationship(
        back_populates="pending_downgrade_client_subscriptions",
        foreign_keys="[ClientSubscription.pending_downgrade_plan_id]",
    )


"""
Enabled feature modules per client.
"""
class ClientModule(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "client_modules"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    client: Mapped["Client"] = relationship(back_populates="modules")
    module: Mapped["Module"] = relationship(back_populates="client_modules")
