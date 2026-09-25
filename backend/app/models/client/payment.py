import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    ABANDONED = "ABANDONED"


class PaymentMethod(str, enum.Enum):
    STRIPE = "stripe"
    PAYPAL = "paypal"
    RAZORPAY = "razorpay"
    CASHFREE = "cashfree"
    PAYTM = "paytm"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    WALLET = "wallet"
    OTHER = "other"


class Payment(Base, UUIDMixin, TimestampMixin):
    """Payment transaction record for end users."""

    __tablename__ = "payments"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    # Coupon tracking
    coupon_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("coupons.id", ondelete="SET NULL"), nullable=True
    )
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    original_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))  # Amount before discount
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    tax_snapshot: Mapped[list[dict] | None] = mapped_column(JSONB)
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False
    )
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), nullable=False)
    gateway_transaction_id: Mapped[str | None] = mapped_column(String(255), index=True)
    gateway_order_id: Mapped[str | None] = mapped_column(String(255))
    # Polymorphic reference – what was paid for
    reference_type: Mapped[str | None] = mapped_column(String(50))   # subscription | ppv | rental
    reference_id: Mapped[str | None] = mapped_column(String(50))
    paid_at: Mapped[str | None] = mapped_column(String(50))
    refunded_at: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)


class Invoice(Base, UUIDMixin, TimestampMixin):
    """Invoice generated for a successful payment."""

    __tablename__ = "invoices"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False
    )
    invoice_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    # Coupon tracking
    coupon_code: Mapped[str | None] = mapped_column(String(50))
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    original_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))  # Amount before discount
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    issued_at: Mapped[str] = mapped_column(String(50), nullable=False)
    due_at: Mapped[str | None] = mapped_column(String(50))
    pdf_url: Mapped[str | None] = mapped_column(Text)
