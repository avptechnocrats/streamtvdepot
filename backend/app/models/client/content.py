import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, Numeric, String, Table, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


# ─── Media Asset ─────────────────────────────────────────────────────────────

class MediaAsset(Base, UUIDMixin, TimestampMixin):
    """S3-uploaded file tracked in the media library."""
    __tablename__ = "media_assets"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    content_type: Mapped[str | None] = mapped_column(String(100))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)


# ─── Category ────────────────────────────────────────────────────────────────

class Category(Base, UUIDMixin, TimestampMixin):
    """Hierarchical content category, scoped per client."""
    __tablename__ = "content_categories"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_parent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    thumbnail_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    thumbnail_url: Mapped[str | None] = mapped_column(Text)   # 1:1 / 1080x1080 — denormalised from asset
    banner_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    banner_url: Mapped[str | None] = mapped_column(Text)       # 16:9 / 1280x720 — denormalised from asset
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # ["video","series",...]

    # Relationship: categories ↔ videos (many-to-many via video_categories)
    videos: Mapped[list["Video"]] = relationship(
        "Video",
        secondary="video_categories",
        back_populates="categories",
        lazy="selectin",
    )
    audios: Mapped[list["Audio"]] = relationship(
        "Audio",
        secondary="audio_categories",
        back_populates="categories",
        lazy="selectin",
    )
    series_list: Mapped[list["Series"]] = relationship(
        "Series",
        secondary="series_categories",
        back_populates="categories",
        lazy="selectin",
    )
    livestreams: Mapped[list["LiveStream"]] = relationship(
        "LiveStream",
        secondary="livestream_categories",
        back_populates="categories",
        lazy="selectin",
    )


class ContentStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    SCHEDULED = "scheduled"


class AccessType(str, enum.Enum):
    FREE = "free"
    SUBSCRIPTION = "subscription"
    PPV = "ppv"
    RENTAL = "rental"


class ContentPartner(Base, UUIDMixin, TimestampMixin):
    """A rights holder that supplies content to one tenant."""

    __tablename__ = "content_partners"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    subscription_share_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    rental_share_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    ppv_share_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    settlement_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")


class PartnerRevenueLedger(Base, UUIDMixin, TimestampMixin):
    """Immutable settlement line created from a settled transaction or period allocation."""

    __tablename__ = "partner_revenue_ledger"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_partners.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="RESTRICT"), nullable=True, unique=True
    )
    content_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    revenue_type: Mapped[str] = mapped_column(String(20), nullable=False)  # rental | ppv | subscription_pool
    reporting_period: Mapped[str | None] = mapped_column(String(7))  # YYYY-MM for subscription allocations
    gross_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    share_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    partner_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── Audio ───────────────────────────────────────────────────────────────────

class Audio(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_audio"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    artist: Mapped[str | None] = mapped_column(String(255))
    album: Mapped[str | None] = mapped_column(String(255))
    genre: Mapped[str | None] = mapped_column(String(100))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    file_url: Mapped[str | None] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    access_type: Mapped[AccessType] = mapped_column(
        Enum(AccessType), default=AccessType.FREE, nullable=False
    )
    subscription_plan_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus), default=ContentStatus.DRAFT, nullable=False
    )
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    categories: Mapped[list["Category"]] = relationship(
        "Category",
        secondary="audio_categories",
        back_populates="audios",
        lazy="selectin",
    )


class VideoAccessType(str, enum.Enum):
    FREE = "free"
    SUBSCRIPTION = "subscription"
    PAY_PER_VIEW = "pay_per_view"
    # Stored as TEXT in DB; validated by Pydantic at API layer


# ─── Association tables ───────────────────────────────────────────────────────

video_categories = Table(
    "video_categories",
    Base.metadata,
    Column("video_id", UUID(as_uuid=True), ForeignKey("content_videos.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", UUID(as_uuid=True), ForeignKey("content_categories.id", ondelete="CASCADE"), primary_key=True),
)

audio_categories = Table(
    "audio_categories",
    Base.metadata,
    Column("audio_id", UUID(as_uuid=True), ForeignKey("content_audio.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", UUID(as_uuid=True), ForeignKey("content_categories.id", ondelete="CASCADE"), primary_key=True),
)

series_categories = Table(
    "series_categories",
    Base.metadata,
    Column("series_id", UUID(as_uuid=True), ForeignKey("content_series.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", UUID(as_uuid=True), ForeignKey("content_categories.id", ondelete="CASCADE"), primary_key=True),
)

livestream_categories = Table(
    "livestream_categories",
    Base.metadata,
    Column("livestream_id", UUID(as_uuid=True), ForeignKey("content_live_streams.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", UUID(as_uuid=True), ForeignKey("content_categories.id", ondelete="CASCADE"), primary_key=True),
)


# ─── Video ───────────────────────────────────────────────────────────────────

class Video(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_videos"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_partners.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    short_description: Mapped[str | None] = mapped_column(Text)
    long_description: Mapped[str | None] = mapped_column(Text)
    categories: Mapped[list["Category"]] = relationship(
        "Category",
        secondary="video_categories",
        back_populates="videos",
        lazy="selectin",
    )
    age_rating: Mapped[str | None] = mapped_column(String(20))
    content_classification: Mapped[str | None] = mapped_column(String(100))
    language: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=None)
    rating: Mapped[float | None] = mapped_column(Numeric(3, 1))
    duration: Mapped[int | None] = mapped_column(Integer)
    cast_crew: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    related_video_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    geo_fencing: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        default=lambda: {"blocked_countries": [], "allowed_countries": []},
    )
    intro_times: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus), default=ContentStatus.DRAFT, nullable=False, index=True
    )
    is_slider: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_thumbnail: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    advertisement: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    video_url: Mapped[str | None] = mapped_column(Text)
    thumbnails: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    trailer_type: Mapped[str | None] = mapped_column(String(20))
    trailer_url: Mapped[str | None] = mapped_column(Text)
    access_type: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    subscription_plan_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    ppv_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    publish_option: Mapped[str] = mapped_column(String(10), nullable=False, default="now")
    publish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    seo: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ── ABR / DRM fields ────────────────────────────────────────────────────
    # transcode_status: pending | processing | complete | failed
    transcode_status: Mapped[str | None] = mapped_column(String(20))
    transcode_job_id: Mapped[str | None] = mapped_column(String(255))
    transcode_progress: Mapped[int | None] = mapped_column(Integer)   # 0-100
    hls_manifest_key: Mapped[str | None] = mapped_column(Text)        # S3 key → master.m3u8
    hls_url: Mapped[str | None] = mapped_column(Text)                 # CDN/S3 playback URL
    # AES-128 DRM: Fernet-encrypted raw key, null when DRM is disabled
    drm_key_encrypted: Mapped[str | None] = mapped_column(Text)


# ─── Transcode Job Log ────────────────────────────────────────────────────────

class TranscodeJob(Base, UUIDMixin, TimestampMixin):
    """
    Full audit log of every MediaConvert job attempt for a video.

    One video can have multiple rows (retries). The most recent row
    reflects the current live state; older rows are history.
    """
    __tablename__ = "transcode_jobs"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    video_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_videos.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # AWS MediaConvert identifiers
    mediaconvert_job_id: Mapped[str | None] = mapped_column(String(255), index=True)
    mediaconvert_queue: Mapped[str | None] = mapped_column(String(500))

    # Input / output
    input_s3_key: Mapped[str | None] = mapped_column(Text)
    output_s3_prefix: Mapped[str | None] = mapped_column(Text)
    hls_url: Mapped[str | None] = mapped_column(Text)

    # Job lifecycle
    # status: pending | processing | complete | failed | canceled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    progress: Mapped[int | None] = mapped_column(Integer)          # 0–100 from EventBridge
    drm_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Error tracking
    error_code: Mapped[str | None] = mapped_column(String(100))    # AWS error code
    error_message: Mapped[str | None] = mapped_column(Text)        # Full error detail

    # Timing
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ─── Series ──────────────────────────────────────────────────────────────────

class Series(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_series"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    genre: Mapped[str | None] = mapped_column(String(100))
    language: Mapped[str | None] = mapped_column(String(50))
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    trailer_url: Mapped[str | None] = mapped_column(Text)
    access_type: Mapped[AccessType] = mapped_column(
        Enum(AccessType), default=AccessType.FREE, nullable=False
    )
    subscription_plan_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus), default=ContentStatus.DRAFT, nullable=False
    )
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    total_seasons: Mapped[int] = mapped_column(Integer, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    categories: Mapped[list["Category"]] = relationship(
        "Category",
        secondary="series_categories",
        back_populates="series_list",
        lazy="selectin",
    )


class Episode(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_episodes"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    series_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_series.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    video_url: Mapped[str | None] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus), default=ContentStatus.DRAFT, nullable=False
    )


# ─── Live Streaming ──────────────────────────────────────────────────────────

class LiveStream(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_live_streams"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    language: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="external")
    stream_url: Mapped[str | None] = mapped_column(Text)  # HLS playback URL (external) or auto-generated HLS URL (rtmp)
    stream_key: Mapped[str | None] = mapped_column(String(255))
    # RTMP-specific fields (auto-populated when source == "rtmp")
    rtmp_key: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    stream_status: Mapped[str] = mapped_column(String(20), nullable=False, default="idle")
    recording_status: Mapped[str] = mapped_column(String(20), nullable=False, default="idle")
    recording_filename: Mapped[str | None] = mapped_column(String(500))
    recording_s3_key: Mapped[str | None] = mapped_column(Text)
    recording_url: Mapped[str | None] = mapped_column(Text)
    recording_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recording_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    thumbnails: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)
    geo_fencing: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"blocked_countries": []}
    )
    access_type: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    subscription_plan_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    categories: Mapped[list["Category"]] = relationship(
        "Category",
        secondary="livestream_categories",
        back_populates="livestreams",
        lazy="selectin",
    )


# ─── PPV Events ──────────────────────────────────────────────────────────────

class PPVEvent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_ppv_events"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="rtmp")
    thumbnails: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    geo_fencing: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"blocked_countries": []}
    )
    pricing_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_subscription_plans.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_live: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    stream_url: Mapped[str | None] = mapped_column(Text)
    rtmp_key: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    scheduled_at: Mapped[str | None] = mapped_column(String(50))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[ContentStatus] = mapped_column(
        Enum(ContentStatus), default=ContentStatus.DRAFT, nullable=False
    )
    is_replay_available: Mapped[bool] = mapped_column(Boolean, default=False)


# ─── Video Rental ─────────────────────────────────────────────────────────────

class VideoRental(Base, UUIDMixin, TimestampMixin):
    """Content available to rent (by linking to a Video)."""

    __tablename__ = "content_rentals"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    video_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_videos.id", ondelete="CASCADE"),
        nullable=False,
    )
    rental_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    rental_duration_hours: Mapped[int] = mapped_column(Integer, default=48)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserVideoRental(Base, UUIDMixin, TimestampMixin):
    """Tracks individual user rental transactions."""

    __tablename__ = "user_video_rentals"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False
    )
    rental_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_rentals.id", ondelete="CASCADE"), nullable=False
    )
    rented_at: Mapped[str] = mapped_column(String(50), nullable=False)
    expires_at: Mapped[str] = mapped_column(String(50), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)


# ─── EPG (Electronic Program Guide) ──────────────────────────────────────────

class EPGProgram(Base, UUIDMixin, TimestampMixin):
    """A scheduled program entry in a live TV channel's EPG."""

    __tablename__ = "epg_programs"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_live_streams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    video_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("content_videos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))   # e.g. News, Sports, Movies
    rating: Mapped[str | None] = mapped_column(String(20))      # e.g. PG, 18+
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    playout_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="schedule")  # schedule | loop

    channel: Mapped["LiveStream"] = relationship("LiveStream", lazy="select")
