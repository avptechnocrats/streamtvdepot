import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.client.subscription import PlanBillingCycle, PlanType, SubscriptionStatus


class CountryPriceItem(BaseModel):
    """A country-specific price override within a plan."""
    country: str
    price: float
    currency: str


class ClientPlanCreate(BaseModel):
    name: str
    description: str | None = None
    price: float
    currency: str = "USD"
    billing_cycle: PlanBillingCycle = PlanBillingCycle.MONTHLY
    plan_type: PlanType = PlanType.SUBSCRIPTION
    trial_days: int = 0
    trial_requires_active_payment_method: bool = False
    applies_to_all_content: bool = True
    applies_to_scope: str = "content"  # content | category_subcategory
    applies_to_content_ids: list[uuid.UUID] | None = None
    applies_to_category_ids: list[uuid.UUID] | None = None
    max_screens: int | None = None
    max_downloads: int | None = None
    can_download: bool = False
    sort_order: int = 0
    restriction_months: int | None = None
    restriction_hours_per_day: int | None = None
    restriction_days: int | None = None
    country_pricing: list[CountryPriceItem] | None = None


class ClientPlanUpdate(ClientPlanCreate):
    name: str | None = None
    price: float | None = None
    is_active: bool | None = None


class ClientPlanOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    name: str
    description: str | None
    price: float
    currency: str
    billing_cycle: PlanBillingCycle
    plan_type: PlanType
    trial_days: int
    trial_requires_active_payment_method: bool
    applies_to_all_content: bool
    applies_to_scope: str
    applies_to_content_ids: list[uuid.UUID] | None
    applies_to_category_ids: list[uuid.UUID] | None
    max_screens: int | None
    max_downloads: int | None
    can_download: bool
    is_active: bool
    sort_order: int
    restriction_months: int | None
    restriction_hours_per_day: int | None
    restriction_days: int | None
    country_pricing: list[CountryPriceItem] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserSubscriptionCreate(BaseModel):
    user_id: uuid.UUID
    plan_id: uuid.UUID
    started_at: str
    expires_at: str | None = None
    auto_renew: bool = True
    executed_by: str = "User"


class UserSubscriptionUpdate(BaseModel):
    plan_id: uuid.UUID | None = None
    status: SubscriptionStatus | None = None
    expires_at: str | None = None
    auto_renew: bool | None = None
    executed_by: str | None = None


class UserSubscriptionOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    user_id: uuid.UUID
    plan_id: uuid.UUID
    status: SubscriptionStatus
    started_at: str
    expires_at: str | None
    auto_renew: bool
    cancelled_at: str | None
    executed_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserSubscriptionDetail(UserSubscriptionOut):
    """Extended view with denormalised user and plan info."""
    user_email: str | None = None
    user_name: str | None = None
    plan_name: str | None = None
    plan_price: float | None = None
    plan_currency: str | None = None
    plan_billing_cycle: PlanBillingCycle | None = None
    plan_type: PlanType | None = None


class SubscriptionListResponse(BaseModel):
    items: list[UserSubscriptionDetail]
    total: int
    page: int
    page_size: int
    counts: dict[str, int] = Field(default_factory=dict)
