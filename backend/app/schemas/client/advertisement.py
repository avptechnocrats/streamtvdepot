import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.client.advertisement import AdEventType, AdStatus, AdType


class AdvertisementCreate(BaseModel):
    title: str
    description: str | None = None
    ad_type: AdType
    media_url: str | None = None
    click_through_url: str | None = None
    duration_seconds: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    budget: float | None = Field(default=None, ge=0)
    cost_per_impression: float | None = Field(default=None, ge=0)
    cost_per_click: float | None = Field(default=None, ge=0)
    is_skippable: bool = True

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("Ad schedule timestamps must include a timezone")
        return value.astimezone(timezone.utc) if value else None

    @model_validator(mode="after")
    def validate_schedule_and_creative(self):
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.ad_type == AdType.VIDEO:
            if not self.media_url:
                raise ValueError("Video advertisements require media_url")
            if self.duration_seconds is None or self.duration_seconds < 1:
                raise ValueError("Video advertisements require a positive duration")
        elif self.ad_type in {AdType.BANNER, AdType.OVERLAY} and not self.media_url:
            raise ValueError("Display advertisements require media_url")
        return self


class AdvertisementUpdate(AdvertisementCreate):
    title: str | None = None
    ad_type: AdType | None = None
    status: AdStatus | None = None


class AdvertisementOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    title: str
    description: str | None
    ad_type: AdType
    media_url: str | None
    click_through_url: str | None
    duration_seconds: int | None
    status: AdStatus
    starts_at: datetime | None
    ends_at: datetime | None
    budget: float | None
    cost_per_impression: float | None
    cost_per_click: float | None
    is_skippable: bool
    total_impressions: int
    total_clicks: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdvertisementListResponse(BaseModel):
    items: list[AdvertisementOut]
    total: int
    page: int
    page_size: int
    counts: dict[str, int]


class AdPlacementCreate(BaseModel):
    ad_id: uuid.UUID
    placement_type: str
    content_type: str | None = None
    content_id: str | None = None
    priority: int = Field(default=0, ge=0)

    @field_validator("placement_type")
    @classmethod
    def validate_placement_type(cls, value: str) -> str:
        if value not in {"pre_roll", "mid_roll", "post_roll", "overlay", "banner", "sidebar"}:
            raise ValueError("Unsupported placement type")
        return value

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, value: str | None) -> str | None:
        if value is not None and value not in {"video", "audio", "series", "live_stream", "ppv_event", "all"}:
            raise ValueError("Unsupported content type")
        return value


class AdPlacementOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    ad_id: uuid.UUID
    placement_type: str
    content_type: str | None
    content_id: str | None
    is_active: bool
    priority: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AdvertisementEventCreate(BaseModel):
    event_id: str = Field(min_length=8, max_length=128)
    advertisement_id: uuid.UUID
    event_type: AdEventType
    session_id: str = Field(min_length=8, max_length=128)
    content_type: str | None = None
    content_id: str | None = None
    placement_type: str | None = None
    occurred_at: datetime
    metadata: dict = Field(default_factory=dict)
    tracking_token: str | None = None


class AdvertisementReportOut(BaseModel):
    advertisement_id: uuid.UUID
    impressions: int
    clicks: int
    completions: int
    billable_revenue: float
