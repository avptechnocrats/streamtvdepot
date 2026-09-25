import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class BillingStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class SaasBilling(Base, UUIDMixin, TimestampMixin):
    """Billing records that SuperAdmin raises for Clients."""

    __tablename__ = "saas_billing"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("saas_subscription_plans.id", ondelete="SET NULL")
    )
    invoice_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    status: Mapped[BillingStatus] = mapped_column(
        Enum(BillingStatus), default=BillingStatus.PENDING, nullable=False
    )
    billing_period_start: Mapped[str | None] = mapped_column(String(50))
    billing_period_end: Mapped[str | None] = mapped_column(String(50))
    paid_at: Mapped[str | None] = mapped_column(String(50))
    payment_method: Mapped[str | None] = mapped_column(String(100))
    transaction_id: Mapped[str | None] = mapped_column(String(255))
    period_year: Mapped[int | None] = mapped_column(Integer)
    period_month: Mapped[int | None] = mapped_column(Integer)
    usage_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_monthly_usage.id", ondelete="SET NULL")
    )
    plan_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    usage_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    overage_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total_due: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    proration_factor: Mapped[float] = mapped_column(Numeric(8, 6), default=1, nullable=False)
    active_days: Mapped[int | None] = mapped_column(Integer)
    billing_days: Mapped[int | None] = mapped_column(Integer)
    finalized_at: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
