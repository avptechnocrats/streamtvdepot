import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class DiscountType(str, enum.Enum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"


class Coupon(Base, UUIDMixin, TimestampMixin):
    """Discount coupons that can be applied during checkout."""

    __tablename__ = "coupons"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    
    # Discount configuration
    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, values_callable=lambda x: [e.value for e in x], native_enum=True),
        default=DiscountType.PERCENTAGE,
        nullable=False
    )
    discount_value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    
    # Restrictions
    min_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))  # Minimum purchase amount
    max_discount_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))  # Cap for percentage discounts
    
    # Usage limits
    max_uses: Mapped[int | None] = mapped_column(Integer)  # Total usage limit (null = unlimited)
    max_uses_per_user: Mapped[int | None] = mapped_column(Integer)  # Per-user limit
    current_uses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Currency restriction (null = legacy coupon valid for every currency)
    currency: Mapped[str | None] = mapped_column(String(3))
    
    # Validity period
    valid_from: Mapped[str | None] = mapped_column(String(50))  # ISO datetime
    valid_until: Mapped[str | None] = mapped_column(String(50))  # ISO datetime
    
    # Plan restrictions (null = applies to all plans)
    applies_to_plan_ids: Mapped[list | None] = mapped_column(JSONB)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CouponUsage(Base, UUIDMixin, TimestampMixin):
    """Track individual coupon usage by users."""

    __tablename__ = "coupon_usages"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    coupon_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False
    )
    
    # Snapshot of discount applied
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    original_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    final_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    
    used_at: Mapped[str] = mapped_column(String(50), nullable=False)  # ISO datetime
