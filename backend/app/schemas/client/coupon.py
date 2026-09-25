import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.client.coupon import DiscountType


# ─── Request/Create schemas ───────────────────────────────────────────────────

class CouponCreate(BaseModel):
    code: str = Field(..., min_length=3, max_length=50)
    description: str | None = None
    discount_type: DiscountType = DiscountType.PERCENTAGE
    discount_value: float = Field(..., gt=0)
    min_amount: float | None = Field(None, ge=0)
    max_discount_amount: float | None = Field(None, ge=0)
    max_uses: int | None = Field(None, gt=0)
    max_uses_per_user: int | None = Field(None, gt=0)
    currency: str = Field(..., min_length=3, max_length=3)
    valid_from: str | None = None  # ISO datetime
    valid_until: str | None = None  # ISO datetime
    applies_to_plan_ids: list[uuid.UUID] | None = None
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def code_uppercase(cls, v: str) -> str:
        """Convert code to uppercase and remove spaces."""
        return v.strip().upper()

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("discount_value")
    @classmethod
    def validate_discount_value(cls, v: float, info) -> float:
        """Ensure percentage is between 0-100."""
        if info.data.get("discount_type") == DiscountType.PERCENTAGE and v > 100:
            raise ValueError("Percentage discount cannot exceed 100")
        return v


class CouponUpdate(BaseModel):
    description: str | None = None
    discount_type: DiscountType | None = None
    discount_value: float | None = Field(None, gt=0)
    min_amount: float | None = Field(None, ge=0)
    max_discount_amount: float | None = Field(None, ge=0)
    max_uses: int | None = None
    max_uses_per_user: int | None = None
    currency: str | None = Field(None, min_length=3, max_length=3)
    valid_from: str | None = None
    valid_until: str | None = None
    applies_to_plan_ids: list[uuid.UUID] | None = None
    is_active: bool | None = None

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else None


# ─── Response schemas ─────────────────────────────────────────────────────────

class CouponOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    code: str
    description: str | None
    discount_type: DiscountType
    discount_value: float
    min_amount: float | None
    max_discount_amount: float | None
    max_uses: int | None
    max_uses_per_user: int | None
    current_uses: int
    currency: str | None
    valid_from: str | None
    valid_until: str | None
    applies_to_plan_ids: list[uuid.UUID] | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CouponUsageOut(BaseModel):
    id: uuid.UUID
    coupon_id: uuid.UUID
    user_id: uuid.UUID
    payment_id: uuid.UUID
    discount_amount: float
    original_amount: float
    final_amount: float
    used_at: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Validation schemas (for checkout) ───────────────────────────────────────

class CouponValidateRequest(BaseModel):
    code: str
    plan_id: uuid.UUID
    amount: float = Field(..., gt=0)


class CouponValidateResponse(BaseModel):
    valid: bool
    message: str | None = None
    discount_amount: float | None = None
    final_amount: float | None = None
    coupon: CouponOut | None = None


# ─── Statistics ───────────────────────────────────────────────────────────────

class CouponStatsOut(BaseModel):
    total_coupons: int
    active_coupons: int
    total_usage: int
    total_discount_given: float
