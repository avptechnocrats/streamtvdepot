import uuid
from datetime import datetime

from pydantic import BaseModel


class AlertOut(BaseModel):
    """Usage alert response."""

    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str | None
    billing_year: int
    billing_month: int
    metric_type: str
    threshold_type: str
    status: str
    current_usage: float
    plan_limit: float | None
    usage_percentage: float
    notified_at: datetime | None
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertListParams(BaseModel):
    """Query params for alerts listing."""

    client_id: uuid.UUID | None = None
    status: str | None = None  # active, resolved
    metric_type: str | None = None
    threshold_type: str | None = None
    page: int = 1
    page_size: int = 20


class AlertAcknowledge(BaseModel):
    """Acknowledge an alert."""

    acknowledged_by: str  # email
