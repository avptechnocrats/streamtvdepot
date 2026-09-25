import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.superadmin.billing import BillingStatus


class SaasBillingCreate(BaseModel):
    client_id: uuid.UUID
    plan_id: uuid.UUID | None = None
    invoice_number: str
    amount: float
    currency: str = "USD"
    billing_period_start: str | None = None
    billing_period_end: str | None = None
    period_year: int | None = None
    period_month: int | None = None
    usage_record_id: uuid.UUID | None = None
    plan_snapshot: dict[str, Any] | None = None
    usage_snapshot: dict[str, Any] | None = None
    subtotal: float | None = None
    overage_total: float | None = None
    discount_amount: float | None = None
    tax_amount: float | None = None
    total_due: float | None = None
    proration_factor: float | None = None
    active_days: int | None = None
    billing_days: int | None = None
    finalized_at: str | None = None
    notes: str | None = None


class SaasBillingUpdate(BaseModel):
    status: BillingStatus | None = None
    paid_at: str | None = None
    payment_method: str | None = None
    transaction_id: str | None = None
    subtotal: float | None = None
    overage_total: float | None = None
    discount_amount: float | None = None
    tax_amount: float | None = None
    total_due: float | None = None
    finalized_at: str | None = None
    notes: str | None = None


class SaasBillingOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    plan_id: uuid.UUID | None
    invoice_number: str
    amount: float
    currency: str
    status: BillingStatus
    billing_period_start: str | None
    billing_period_end: str | None
    period_year: int | None
    period_month: int | None
    usage_record_id: uuid.UUID | None
    plan_snapshot: dict[str, Any] | None
    usage_snapshot: dict[str, Any] | None
    subtotal: float
    overage_total: float
    discount_amount: float
    tax_amount: float
    total_due: float
    proration_factor: float
    active_days: int | None
    billing_days: int | None
    finalized_at: str | None
    paid_at: str | None
    payment_method: str | None
    transaction_id: str | None
    notes: str | None
    created_at: datetime
    # Joined from clients table — not a DB column
    client_name: str | None = None
    client_slug: str | None = None

    model_config = {"from_attributes": True}
