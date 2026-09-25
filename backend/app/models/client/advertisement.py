import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class AdType(str, enum.Enum):
    BANNER = "banner"
    VIDEO = "video"
    POPUP = "popup"
    OVERLAY = "overlay"


class AdStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    EXPIRED = "expired"


class AdEventType(str, enum.Enum):
    REQUEST = "request"
    IMPRESSION = "impression"
    START = "start"
    FIRST_QUARTILE = "first_quartile"
    MIDPOINT = "midpoint"
    THIRD_QUARTILE = "third_quartile"
    COMPLETE = "complete"
    SKIP = "skip"
    ERROR = "error"
    CLICK = "click"


class Advertisement(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "advertisements"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    ad_type: Mapped[AdType] = mapped_column(Enum(AdType), nullable=False)
    media_url: Mapped[str | None] = mapped_column(Text)          # image or video URL
    click_through_url: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)  # for video ads
    status: Mapped[AdStatus] = mapped_column(
        Enum(AdStatus), default=AdStatus.DRAFT, nullable=False
    )
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Budget / billing
    budget: Mapped[float | None] = mapped_column(Numeric(10, 2))
    cost_per_impression: Mapped[float | None] = mapped_column(Numeric(10, 4))
    cost_per_click: Mapped[float | None] = mapped_column(Numeric(10, 4))
    total_impressions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_clicks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_skippable: Mapped[bool] = mapped_column(Boolean, default=True)


class AdPlacement(Base, UUIDMixin, TimestampMixin):
    """Defines where and on which content an ad should appear."""

    __tablename__ = "ad_placements"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("advertisements.id", ondelete="CASCADE"),
        nullable=False,
    )
    placement_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # pre_roll | mid_roll | post_roll | sidebar | banner
    content_type: Mapped[str | None] = mapped_column(String(50))   # video | audio | series | all
    content_id: Mapped[str | None] = mapped_column(String(50))     # specific content UUID or null=all
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)


class AdvertisementEvent(Base, UUIDMixin):
    """Immutable, idempotent delivery ledger used for billing and reporting."""

    __tablename__ = "advertisement_events"
    __table_args__ = (
        UniqueConstraint("client_id", "event_id", name="uq_ad_event_client_event_id"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    advertisement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("advertisements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    event_type: Mapped[AdEventType] = mapped_column(Enum(AdEventType), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    content_type: Mapped[str | None] = mapped_column(String(50))
    content_id: Mapped[str | None] = mapped_column(String(50))
    placement_type: Mapped[str | None] = mapped_column(String(50))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    billable_amount: Mapped[float] = mapped_column(Numeric(12, 6), default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
