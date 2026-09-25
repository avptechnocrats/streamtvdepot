import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD", "CAD", "AUD"]

APP_PLATFORMS = ["android", "ios", "roku", "apple_tv", "fire_tv"]


class SaasPlanCreate(BaseModel):
    name: str
    sub_text: str | None = None
    slug: str
    description: str | None = None
    price_monthly: float
    price_quarterly: float
    price_yearly: float
    currency: str = "USD"
    key_features: list[str] = []
    additional_apps: dict[str, bool] = {}
    additional_app_price: float | None = None
    max_users: int | None = None
    max_storage_gb: int | None = None
    max_streams: int | None = None
    max_admin_users: int | None = None
    bandwidth_gb_monthly: int | None = None
    encoding_minutes_monthly: int | None = None
    api_calls_per_month: int | None = None
    concurrent_users_peak: int | None = None
    simultaneous_uploads: int = 1
    overage_bandwidth_per_gb: float | None = None
    overage_storage_per_gb: float | None = None
    overage_encoding_per_minute: float | None = None
    overage_api_per_1m_calls: float | None = None
    allowed_content_types: list[str] = []
    max_bitrate_mbps: int | None = None
    content_retention_days: int = 365
    is_trial: bool = False


class SaasPlanUpdate(BaseModel):
    name: str | None = None
    sub_text: str | None = None
    description: str | None = None
    price_monthly: float | None = None
    price_quarterly: float | None = None
    price_yearly: float | None = None
    currency: str | None = None
    key_features: list[str] | None = None
    additional_apps: dict[str, bool] | None = None
    additional_app_price: float | None = None
    max_users: int | None = None
    max_storage_gb: int | None = None
    max_streams: int | None = None
    max_admin_users: int | None = None
    bandwidth_gb_monthly: int | None = None
    encoding_minutes_monthly: int | None = None
    api_calls_per_month: int | None = None
    concurrent_users_peak: int | None = None
    simultaneous_uploads: int | None = None
    overage_bandwidth_per_gb: float | None = None
    overage_storage_per_gb: float | None = None
    overage_encoding_per_minute: float | None = None
    overage_api_per_1m_calls: float | None = None
    allowed_content_types: list[str] | None = None
    max_bitrate_mbps: int | None = None
    content_retention_days: int | None = None
    is_active: bool | None = None
    is_trial: bool | None = None

    @field_validator("price_quarterly", "price_yearly")
    @classmethod
    def require_billing_prices_when_provided(cls, value: float | None) -> float:
        if value is None:
            raise ValueError("Quarterly and yearly prices are required")
        return value


class SaasPlanOut(BaseModel):
    id: uuid.UUID
    name: str
    sub_text: str | None
    slug: str
    description: str | None
    price_monthly: float
    price_quarterly: float | None
    price_yearly: float | None
    currency: str
    key_features: list[str] | None
    additional_apps: dict[str, bool] | None
    additional_app_price: float | None
    max_users: int | None
    max_storage_gb: int | None
    max_streams: int | None
    max_admin_users: int | None
    bandwidth_gb_monthly: int | None
    encoding_minutes_monthly: int | None
    api_calls_per_month: int | None
    concurrent_users_peak: int | None
    simultaneous_uploads: int
    overage_bandwidth_per_gb: float | None
    overage_storage_per_gb: float | None
    overage_encoding_per_minute: float | None
    overage_api_per_1m_calls: float | None
    allowed_content_types: list[str] | None
    max_bitrate_mbps: int | None
    content_retention_days: int
    is_active: bool
    is_trial: bool
    deleted_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
