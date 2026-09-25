import uuid
from datetime import datetime

from pydantic import BaseModel, computed_field


class ClientUsageSummary(BaseModel):
    """Per-client usage summary for the listing view — current month vs. plan limits."""

    # Client identity
    client_id: uuid.UUID
    client_name: str
    client_slug: str
    client_logo_url: str | None
    client_status: str

    # Plan info
    plan_id: uuid.UUID | None
    plan_name: str | None
    plan_currency: str
    plan_price_monthly: float | None

    # Plan limits (None = unlimited)
    limit_storage_gb: int | None
    limit_bandwidth_gb: int | None
    limit_encoding_minutes: int | None
    limit_users: int | None
    limit_streams: int | None

    # Overage rates
    overage_bandwidth_per_gb: float | None
    overage_storage_per_gb: float | None
    overage_encoding_per_minute: float | None

    # Current month actuals
    storage_gb_used: float
    bandwidth_gb_used: float
    encoding_minutes_used: float
    api_calls_used: int
    concurrent_users_peak: int

    # Content counts
    total_videos: int
    total_audio: int
    total_live_streams: int
    total_end_users: int
    total_admin_users: int

    # Overage charges
    overage_storage: float
    overage_bandwidth: float
    overage_encoding: float
    overage_api: float
    total_overage: float
    total_invoice: float
    currency: str

    # Period
    billing_year: int
    billing_month: int

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def storage_pct(self) -> float | None:
        if not self.limit_storage_gb or self.limit_storage_gb <= 0:
            return None
        return round((self.storage_gb_used / self.limit_storage_gb) * 100, 1)

    @computed_field
    @property
    def bandwidth_pct(self) -> float | None:
        if not self.limit_bandwidth_gb or self.limit_bandwidth_gb <= 0:
            return None
        return round((self.bandwidth_gb_used / self.limit_bandwidth_gb) * 100, 1)

    @computed_field
    @property
    def encoding_pct(self) -> float | None:
        if not self.limit_encoding_minutes or self.limit_encoding_minutes <= 0:
            return None
        return round((self.encoding_minutes_used / self.limit_encoding_minutes) * 100, 1)

    @computed_field
    @property
    def usage_status(self) -> str:
        """over_limit | at_risk | normal"""
        pcts = [p for p in [self.storage_pct, self.bandwidth_pct, self.encoding_pct] if p is not None]
        if not pcts:
            return "normal"
        max_pct = max(pcts)
        if max_pct >= 100:
            return "over_limit"
        if max_pct >= 80:
            return "at_risk"
        return "normal"


class MonthlyUsageRecord(BaseModel):
    """Single month row for the detail sparkline / history table."""

    billing_year: int
    billing_month: int
    storage_gb_used: float
    bandwidth_gb_used: float
    encoding_minutes_used: float
    api_calls_used: int
    concurrent_users_peak: int
    total_videos: int
    total_audio: int
    total_live_streams: int
    total_end_users: int
    overage_storage: float
    overage_bandwidth: float
    overage_encoding: float
    overage_api: float
    total_overage: float
    base_fee: float
    total_invoice: float
    is_finalized: bool
    currency: str

    model_config = {"from_attributes": True}


class ClientUsageDetail(BaseModel):
    """Full detail view for a single client."""

    client_id: uuid.UUID
    client_name: str
    client_slug: str
    client_status: str
    plan_name: str | None
    plan_currency: str
    plan_price_monthly: float | None

    # Plan limits
    limit_storage_gb: int | None
    limit_bandwidth_gb: int | None
    limit_encoding_minutes: int | None
    limit_users: int | None
    limit_streams: int | None
    limit_api_calls: int | None

    # Overage rates
    overage_bandwidth_per_gb: float | None
    overage_storage_per_gb: float | None
    overage_encoding_per_minute: float | None
    overage_api_per_1m_calls: float | None

    # Monthly history (up to 12 months, newest first)
    monthly_history: list[MonthlyUsageRecord]


class UsageUpsert(BaseModel):
    """Used internally or by background jobs to record usage."""

    client_id: uuid.UUID
    billing_year: int
    billing_month: int
    storage_gb_used: float | None = None
    bandwidth_gb_used: float | None = None
    encoding_minutes_used: float | None = None
    api_calls_used: int | None = None
    concurrent_users_peak: int | None = None


class UsageSyncRequest(BaseModel):
    """Trigger usage sync from AWS for a specific billing period."""

    billing_year: int
    billing_month: int


class UsageSyncClientMetrics(BaseModel):
    bandwidth_gb_used: float
    storage_gb_used: float
    encoding_minutes_used: float
    concurrent_users_peak: int


class UsageSyncClientResult(BaseModel):
    client_id: str
    client_slug: str
    success: bool
    metrics: UsageSyncClientMetrics | None = None
    diagnostics: dict[str, str] = {}


class UsageSyncResponse(BaseModel):
    """Result returned after usage sync run."""

    status: str
    message: str
    billing_year: int
    billing_month: int
    attempted_clients: int
    successful_clients: int
    failed_clients: int
    client_results: list[UsageSyncClientResult] = []
