import re
import uuid
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.client.content import AccessType, ContentStatus


# ─── Thumbnail URL helpers ────────────────────────────────────────────────────

def _refresh_thumbnail_urls(thumbnails: dict) -> dict:
    """
    Re-generate presigned S3 GET URLs for every value in a thumbnails dict.

    The JSONB ``thumbnails`` column may contain either:
    - A 7-day presigned URL (stored at upload time) — may be expired.
    - A permanent public S3 URL (stored by newer code).

    Both forms share the URL pattern:
        https://<bucket>.s3[.<region>].amazonaws.com/<s3_key>[?X-Amz-…]

    We extract the S3 key from the path and call ``presign_get_url`` so that
    every API response always carries a fresh 7-day presigned URL.
    """
    if not thumbnails:
        return thumbnails

    from app.core.config import settings
    from app.core.storage import media_display_url

    bucket = settings.AWS_S3_BUCKET
    if not bucket:
        return thumbnails

    # Matches both presigned and permanent URLs for any region variant:
    #   https://<bucket>.s3.amazonaws.com/<key>
    #   https://<bucket>.s3.<region>.amazonaws.com/<key>
    _S3_URL_RE = re.compile(
        rf"https://{re.escape(bucket)}\.s3(?:\.[^/]+)?\.amazonaws\.com/([^?#]+)"
    )

    refreshed: dict = {}
    for field, url in thumbnails.items():
        if url and isinstance(url, str):
            m = _S3_URL_RE.match(url)
            if m:
                s3_key = m.group(1)
                fresh = media_display_url(s3_key)
                refreshed[field] = fresh if fresh else url
            else:
                refreshed[field] = url
        else:
            refreshed[field] = url
    return refreshed


def _refresh_s3_url(url: str | None) -> str | None:
    """
    Re-generate a presigned S3 GET URL for a single stored URL string.

    Works for both presigned (expiring) and permanent public S3 URLs.
    Non-S3 URLs (CloudFront, external CDN, etc.) are returned unchanged.
    Returns None when input is None.
    """
    if not url:
        return url

    from urllib.parse import urlparse

    from app.core.config import settings
    from app.core.storage import media_display_url

    bucket = settings.AWS_S3_BUCKET
    if not bucket:
        return url

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if "amazonaws.com" not in host:
        return url  # not an S3 URL — leave unchanged

    key = parsed.path.lstrip("/")
    if not key:
        return url

    fresh = media_display_url(key)
    return fresh if fresh else url


# ─── Media Asset ─────────────────────────────────────────────────────────────

class MediaAssetCreate(BaseModel):
    original_filename: str
    s3_key: str
    url: str
    file_size: int | None = None
    content_type: str | None = None
    width: int | None = None
    height: int | None = None


class MediaAssetOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    original_filename: str
    s3_key: str
    url: str
    display_url: str | None = None   # presigned GET URL — populated by API, not stored in DB
    file_size: int | None
    content_type: str | None
    width: int | None
    height: int | None
    created_at: datetime
    in_use: bool = False             # True if referenced by any content; set at serve time

    model_config = {"from_attributes": True}


# ─── Category ────────────────────────────────────────────────────────────────

CATEGORY_CONTENT_TYPES = ["video", "audio", "livestream", "series", "channel"]


class CategoryCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    is_parent: bool = False
    parent_id: uuid.UUID | None = None
    thumbnail_asset_id: uuid.UUID | None = None
    thumbnail_url: str | None = None
    banner_asset_id: uuid.UUID | None = None
    banner_url: str | None = None
    sort_order: int = 0
    content_types: list[str] = Field(default_factory=list)


class CategoryUpdate(CategoryCreate):
    name: str | None = None
    slug: str | None = None


class CategoryOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_parent: bool
    parent_id: uuid.UUID | None
    thumbnail_asset_id: uuid.UUID | None
    thumbnail_url: str | None
    thumbnail_display_url: str | None = None   # presigned GET URL — populated at serve time
    banner_asset_id: uuid.UUID | None
    banner_url: str | None
    banner_display_url: str | None = None       # presigned GET URL — populated at serve time
    sort_order: int
    content_types: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CategoryListResponse(BaseModel):
    items: list[CategoryOut]
    total: int
    page: int
    page_size: int


# ─── Audio ───────────────────────────────────────────────────────────────────

class AudioCreate(BaseModel):
    title: str
    description: str | None = None
    artist: str | None = None
    album: str | None = None
    genre: str | None = None
    categories: list[str] = Field(default_factory=list)  # category slugs
    duration_seconds: int | None = None
    file_url: str | None = None
    thumbnail_url: str | None = None
    access_type: AccessType = AccessType.FREE
    subscription_plan_ids: list[str] = Field(default_factory=list)
    status: ContentStatus = ContentStatus.DRAFT
    is_featured: bool = False


class AudioUpdate(AudioCreate):
    title: str | None = None


class AudioOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    title: str
    description: str | None
    artist: str | None
    album: str | None
    genre: str | None
    categories: list[str] = Field(default_factory=list)  # category slugs
    duration_seconds: int | None
    file_url: str | None
    thumbnail_url: str | None
    access_type: AccessType
    subscription_plan_ids: list[str] = Field(default_factory=list)
    status: ContentStatus
    is_featured: bool
    created_at: datetime

    @field_validator("categories", mode="before")
    @classmethod
    def _coerce_categories(cls, v):
        if not v:
            return []
        if hasattr(v[0], "slug"):
            return [c.slug for c in v]
        return list(v)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def refresh_s3_urls(self) -> "AudioOut":
        self.thumbnail_url = _refresh_s3_url(self.thumbnail_url)
        self.file_url = _refresh_s3_url(self.file_url)
        return self


# ─── Video ───────────────────────────────────────────────────────────────────

# Sub-models for JSONB fields
class CastCrewMember(BaseModel):
    name: str
    role: str
    character: str | None = None


class GeoFencing(BaseModel):
    blocked_countries: list[str] = Field(default_factory=list)
    allowed_countries: list[str] = Field(default_factory=list)


class IntroTimes(BaseModel):
    skip_start_time: float | None = None
    skip_end_time: float | None = None
    recap_start_time: float | None = None
    recap_end_time: float | None = None
    skip_start_session: float | None = None
    skip_end_session: float | None = None


class AdBreak(BaseModel):
    position: str                                 # pre | mid | post
    at_seconds: float | None = None               # required for mid
    max_ads: int | None = None                    # optional pod size cap
    total_duration_seconds: int | None = None     # optional ad pod duration cap

    @model_validator(mode="after")
    def validate_break(self):
        if self.position not in {"pre", "mid", "post"}:
            raise ValueError("position must be pre, mid, or post")
        if self.at_seconds is not None and self.at_seconds < 0:
            raise ValueError("at_seconds cannot be negative")
        if self.max_ads is not None and self.max_ads < 1:
            raise ValueError("max_ads must be positive")
        if self.total_duration_seconds is not None and self.total_duration_seconds < 1:
            raise ValueError("total_duration_seconds must be positive")
        return self


class AdCuePoint(BaseModel):
    """Pins a single ad (any ad_type) to an exact playback timestamp on this video."""
    advertisement_id: str
    at_seconds: float

    @model_validator(mode="after")
    def validate_cue_point(self):
        if not self.advertisement_id:
            raise ValueError("advertisement_id is required")
        if self.at_seconds < 0:
            raise ValueError("at_seconds cannot be negative")
        return self


class Advertisement(BaseModel):
    pre_ad_id: str | None = None
    post_ad_id: str | None = None
    mid_category_ad_id: str | None = None
    mid_ad_sequence_time: float | None = None
    ad_mode: str | None = None                  # hybrid | csai | ssai | none
    vmap_tag_url: str | None = None            # primary CSAI schedule tag
    vast_tag_url: str | None = None            # CSAI fallback tag
    csai_vmap_tag_url: str | None = None       # backwards-compatible alias
    csai_vast_tag_url: str | None = None       # backwards-compatible alias
    ssai_enabled: bool | None = None           # per-title SSAI override
    ad_breaks: list[AdBreak] = Field(default_factory=list)
    cue_points: list[AdCuePoint] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_advertisement(self):
        if self.ad_mode not in {None, "hybrid", "csai", "ssai", "none"}:
            raise ValueError("Unsupported advertisement mode")
        if len(self.ad_breaks) > 12:
            raise ValueError("A maximum of 12 ad breaks is allowed")
        if sum(item.position == "pre" for item in self.ad_breaks) > 1:
            raise ValueError("Only one pre-roll break is allowed")
        if sum(item.position == "post" for item in self.ad_breaks) > 1:
            raise ValueError("Only one post-roll break is allowed")
        mid_times = sorted(
            item.at_seconds for item in self.ad_breaks
            if item.position == "mid" and item.at_seconds is not None
        )
        if any(current - previous < 30 for previous, current in zip(mid_times, mid_times[1:])):
            raise ValueError("Mid-roll breaks must be at least 30 seconds apart")
        if len(self.cue_points) > 20:
            raise ValueError("A maximum of 20 cue-point ads is allowed")
        return self


class VideoSeo(BaseModel):
    meta_title: str | None = None
    meta_description: str | None = None
    meta_keywords: str | None = None
    og_image_url: str | None = None


class VideoThumbnails(BaseModel):
    video_banner: str | None = None
    video_h_thumbnail: str | None = None
    video_w_thumbnail: str | None = None

    @model_validator(mode="after")
    def refresh_presigned_urls(self) -> "VideoThumbnails":
        self.video_banner = _refresh_s3_url(self.video_banner)
        self.video_h_thumbnail = _refresh_s3_url(self.video_h_thumbnail)
        self.video_w_thumbnail = _refresh_s3_url(self.video_w_thumbnail)
        return self


class VideoCreate(BaseModel):
    title: str
    slug: str
    short_description: str | None = None
    long_description: str | None = None
    categories: list[str] = Field(default_factory=list)  # category slugs
    age_rating: str | None = None
    content_classification: str | None = None
    language: list[str] = Field(default_factory=list)
    rating: float | None = None
    duration: int | None = None
    cast_crew: list[CastCrewMember] = Field(default_factory=list)
    related_video_ids: list[str] = Field(default_factory=list)
    geo_fencing: GeoFencing = Field(default_factory=GeoFencing)
    intro_times: IntroTimes = Field(default_factory=IntroTimes)
    is_featured: bool = False
    is_active: bool = True
    status: ContentStatus = ContentStatus.DRAFT
    is_slider: bool = False
    is_thumbnail: bool = False
    advertisement: Advertisement = Field(default_factory=Advertisement)
    video_url: str | None = None
    thumbnails: VideoThumbnails = Field(default_factory=VideoThumbnails)
    trailer_type: str | None = None
    trailer_url: str | None = None
    access_type: str = "free"
    subscription_plan_ids: list[str] = Field(default_factory=list)
    ppv_price: float | None = None
    publish_option: str = "now"
    publish_at: str | None = None
    seo: VideoSeo = Field(default_factory=VideoSeo)
    partner_id: uuid.UUID | None = None


class VideoUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    short_description: str | None = None
    long_description: str | None = None
    categories: list[str] | None = None  # category slugs
    age_rating: str | None = None
    content_classification: str | None = None
    language: list[str] | None = None
    rating: float | None = None
    duration: int | None = None
    cast_crew: list[CastCrewMember] | None = None
    related_video_ids: list[str] | None = None
    geo_fencing: GeoFencing | None = None
    intro_times: IntroTimes | None = None
    is_featured: bool | None = None
    is_active: bool | None = None
    status: ContentStatus | None = None
    is_slider: bool | None = None
    is_thumbnail: bool | None = None
    advertisement: Advertisement | None = None
    video_url: str | None = None
    thumbnails: VideoThumbnails | None = None
    trailer_type: str | None = None
    trailer_url: str | None = None
    access_type: str | None = None
    subscription_plan_ids: list[str] | None = None
    ppv_price: float | None = None
    publish_option: str | None = None
    publish_at: str | None = None
    seo: VideoSeo | None = None
    partner_id: uuid.UUID | None = None


class VideoOut(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    short_description: str | None
    long_description: str | None
    categories: list[str] = Field(default_factory=list)  # category slugs
    age_rating: str | None
    content_classification: str | None
    language: list[str] = Field(default_factory=list)
    rating: float | None
    duration: int | None
    cast_crew: list[CastCrewMember] = Field(default_factory=list)
    related_video_ids: list[str] = Field(default_factory=list)
    geo_fencing: GeoFencing = Field(default_factory=GeoFencing)
    intro_times: IntroTimes = Field(default_factory=IntroTimes)
    is_featured: bool
    is_active: bool
    status: ContentStatus
    is_slider: bool
    is_thumbnail: bool
    advertisement: Advertisement = Field(default_factory=Advertisement)
    video_url: str | None
    thumbnails: VideoThumbnails = Field(default_factory=VideoThumbnails)
    trailer_type: str | None
    trailer_url: str | None
    access_type: str
    subscription_plan_ids: list[str] = Field(default_factory=list)
    ppv_price: float | None
    publish_option: str
    publish_at: str | None
    seo: VideoSeo = Field(default_factory=VideoSeo)
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    partner_id: uuid.UUID | None = None
    # ABR / DRM
    transcode_status: str | None = None
    transcode_progress: int | None = None
    hls_url: str | None = None
    transcode_error_message: str | None = None
    drm_enabled: bool = False

    @field_validator("categories", mode="before")
    @classmethod
    def _coerce_categories(cls, v):
        """Accept either a list of Category ORM objects or a list of slug strings."""
        if not v:
            return []
        if hasattr(v[0], "slug"):
            return [c.slug for c in v]
        return list(v)

    @field_validator("language", mode="before")
    @classmethod
    def _coerce_language(cls, value):
        return value or []

    @classmethod
    def model_validate(cls, obj, **kwargs):
        instance = super().model_validate(obj, **kwargs)
        # Decode error stored as "error:<detail>" in transcode_job_id
        job_id = getattr(obj, "transcode_job_id", None) or ""
        if instance.transcode_status == "failed" and job_id.startswith("error:"):
            instance.transcode_error_message = job_id[len("error:"):]
        # drm_enabled = True when an encrypted key is stored
        instance.drm_enabled = bool(getattr(obj, "drm_key_encrypted", None))
        return instance

    model_config = {"from_attributes": True}


class PublicVideoOut(BaseModel):
    """VideoOut with all storefront-needed fields — no DRM keys or admin-only fields."""
    id: uuid.UUID
    title: str
    slug: str
    short_description: str | None
    long_description: str | None
    categories: list[str] = Field(default_factory=list)  # category slugs
    age_rating: str | None
    content_classification: str | None
    language: list[str] = Field(default_factory=list)
    rating: float | None
    duration: int | None
    cast_crew: list[CastCrewMember] = Field(default_factory=list)
    related_video_ids: list[str] = Field(default_factory=list)
    is_featured: bool = False
    is_active: bool = True
    is_slider: bool = False
    video_url: str | None
    video_display_url: str | None = None        # presigned GET URL — populated at serve time
    hls_url: str | None = None
    hls_display_url: str | None = None          # presigned GET URL — populated at serve time
    thumbnails: VideoThumbnails = Field(default_factory=VideoThumbnails)
    trailer_type: str | None
    trailer_url: str | None
    access_type: str
    subscription_plan_ids: list[str] = Field(default_factory=list)
    ppv_price: float | None
    publish_at: str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("categories", mode="before")
    @classmethod
    def _coerce_categories(cls, v):
        """Accept either a list of Category ORM objects or a list of slug strings."""
        if not v:
            return []
        if hasattr(v[0], "slug"):
            return [c.slug for c in v]
        return list(v)

    model_config = {"from_attributes": True}


# ─── Series ──────────────────────────────────────────────────────────────────

class SeriesCreate(BaseModel):
    title: str
    description: str | None = None
    genre: str | None = None
    categories: list[str] = Field(default_factory=list)  # category slugs
    language: str | None = None
    thumbnail_url: str | None = None
    trailer_url: str | None = None
    access_type: AccessType = AccessType.FREE
    subscription_plan_ids: list[str] = Field(default_factory=list)
    status: ContentStatus = ContentStatus.DRAFT
    is_featured: bool = False
    total_seasons: int = 1


class SeriesUpdate(SeriesCreate):
    title: str | None = None


class SeriesOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    title: str
    description: str | None
    genre: str | None
    categories: list[str] = Field(default_factory=list)  # category slugs
    language: str | None
    thumbnail_url: str | None
    trailer_url: str | None
    access_type: AccessType
    subscription_plan_ids: list[str] = Field(default_factory=list)
    status: ContentStatus
    is_featured: bool
    total_seasons: int
    created_at: datetime

    @field_validator("categories", mode="before")
    @classmethod
    def _coerce_categories(cls, v):
        if not v:
            return []
        if hasattr(v[0], "slug"):
            return [c.slug for c in v]
        return list(v)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def refresh_s3_urls(self) -> "SeriesOut":
        self.thumbnail_url = _refresh_s3_url(self.thumbnail_url)
        return self


class EpisodeCreate(BaseModel):
    series_id: uuid.UUID
    title: str
    description: str | None = None
    season_number: int
    episode_number: int
    duration_seconds: int | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    status: ContentStatus = ContentStatus.DRAFT


class EpisodeUpdate(EpisodeCreate):
    series_id: uuid.UUID | None = None
    title: str | None = None
    season_number: int | None = None
    episode_number: int | None = None


class EpisodeOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    series_id: uuid.UUID
    title: str
    season_number: int
    episode_number: int
    duration_seconds: int | None
    video_url: str | None
    thumbnail_url: str | None
    status: ContentStatus
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def refresh_s3_urls(self) -> "EpisodeOut":
        self.thumbnail_url = _refresh_s3_url(self.thumbnail_url)
        self.video_url = _refresh_s3_url(self.video_url)
        return self


# ─── Live Stream ─────────────────────────────────────────────────────────────

class LiveStreamCreate(BaseModel):
    title: str
    slug: str
    description: str | None = None
    categories: list[str] = Field(default_factory=list)  # category slugs
    language: list[str] = []
    source: str = "external"
    stream_url: str | None = None
    thumbnails: dict = {}
    is_active: bool = True
    is_featured: bool = False
    is_live: bool = False
    geo_fencing: dict = {}
    access_type: str = "free"
    subscription_plan_ids: list[str] = []


class LiveStreamUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    categories: list[str] | None = None  # category slugs
    language: list[str] | None = None
    source: str | None = None
    stream_url: str | None = None
    thumbnails: dict | None = None
    is_active: bool | None = None
    is_featured: bool | None = None
    is_live: bool | None = None
    geo_fencing: dict | None = None
    access_type: str | None = None
    subscription_plan_ids: list[str] | None = None


class LiveStreamOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    title: str
    slug: str
    description: str | None
    categories: list[str] = Field(default_factory=list)  # category slugs
    language: list[str]
    source: str
    stream_url: str | None
    rtmp_key: str | None
    rtmp_ingest_url: str | None = None
    stream_status: str
    recording_status: str
    recording_filename: str | None = None
    recording_s3_key: str | None = None
    recording_url: str | None = None
    recording_started_at: datetime | None = None
    recording_completed_at: datetime | None = None
    thumbnails: dict
    is_active: bool
    is_featured: bool
    is_live: bool
    geo_fencing: dict
    access_type: str
    subscription_plan_ids: list[str]
    created_at: datetime
    updated_at: datetime

    @field_validator("categories", mode="before")
    @classmethod
    def _coerce_categories(cls, v):
        if not v:
            return []
        if hasattr(v[0], "slug"):
            return [c.slug for c in v]
        return list(v)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def set_rtmp_ingest_url(self) -> "LiveStreamOut":
        from app.core.config import settings
        if self.source == "rtmp" and settings.RTMP_SERVER_HOST:
            self.rtmp_ingest_url = (
                f"rtmp://{settings.RTMP_SERVER_HOST}/{settings.RTMP_APP_NAME}"
            )
        return self

    @model_validator(mode="after")
    def refresh_thumbnail_presigned_urls(self) -> "LiveStreamOut":
        self.thumbnails = _refresh_thumbnail_urls(self.thumbnails)
        if self.recording_filename and not self.recording_url:
            from app.core.config import settings

            self.recording_url = (
                f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}/api/v1/rtmp/recordings/{Path(self.recording_filename).name}"
            )
        return self


class PublicLiveStreamOut(BaseModel):
    """LiveStreamOut without sensitive RTMP credentials — safe for unauthenticated responses."""
    id: uuid.UUID
    client_id: uuid.UUID
    title: str
    slug: str
    description: str | None
    categories: list[str] = Field(default_factory=list)  # category slugs
    language: list[str]
    source: str
    stream_url: str | None
    stream_status: str
    recording_status: str
    recording_filename: str | None = None
    recording_s3_key: str | None = None
    recording_url: str | None = None
    recording_started_at: datetime | None = None
    recording_completed_at: datetime | None = None
    thumbnails: dict
    is_active: bool
    is_featured: bool
    is_live: bool
    geo_fencing: dict
    access_type: str
    subscription_plan_ids: list[str]
    created_at: datetime
    updated_at: datetime

    @field_validator("categories", mode="before")
    @classmethod
    def _coerce_categories(cls, v):
        if not v:
            return []
        if hasattr(v[0], "slug"):
            return [c.slug for c in v]
        return list(v)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def refresh_thumbnail_presigned_urls(self) -> "PublicLiveStreamOut":
        self.thumbnails = _refresh_thumbnail_urls(self.thumbnails)
        if self.recording_filename and not self.recording_url:
            from app.core.config import settings

            self.recording_url = (
                f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}/api/v1/rtmp/recordings/{Path(self.recording_filename).name}"
            )
        return self


# ─── Home Contents ────────────────────────────────────────────────────────────

HomeContentItem = PublicVideoOut | SeriesOut | PublicLiveStreamOut | AudioOut


class HomeCategoryRow(BaseModel):
    """A single category row as returned by /home-contents."""
    category_id: uuid.UUID
    category_name: str
    category_slug: str
    content_type: str  # video | series | livestream | audio
    items: list[HomeContentItem]


class HomeContentsOut(BaseModel):
    rows: list[HomeCategoryRow]
    # Pagination helpers so the client knows whether more rows exist
    page: int
    page_size: int          # rows per page (categories, not items)
    has_more: bool


class CategoryDetailOut(BaseModel):
    """Category details with paginated content items from all types."""
    category: CategoryOut
    items: list[HomeContentItem]
    page: int
    page_size: int
    total_items: int
    has_more: bool


# ─── PPV Event ───────────────────────────────────────────────────────────────

class PPVEventCreate(BaseModel):
    title: str
    slug: str
    description: str | None = None
    category: str | None = None
    source: str
    stream_url: str | None = None
    thumbnails: dict[str, str | None] = Field(default_factory=dict)
    geo_fencing: dict[str, list[str]] = Field(
        default_factory=lambda: {"blocked_countries": []}
    )
    pricing_plan_id: uuid.UUID | None = None
    is_active: bool = True
    is_live: bool = False

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        if value not in {"rtmp", "external"}:
            raise ValueError("Source must be either rtmp or external")
        return value

    @model_validator(mode="after")
    def validate_external_stream_url(self) -> "PPVEventCreate":
        if self.source != "external":
            return self
        if not self.stream_url:
            raise ValueError("An external HLS stream URL is required")
        url = self.stream_url.strip()
        if not re.match(r"^https://.+\.m3u8(?:[?#].*)?$", url, flags=re.IGNORECASE):
            raise ValueError("External feed must be a secure HTTPS HLS (.m3u8) URL")
        self.stream_url = url
        return self


class PPVEventUpdate(PPVEventCreate):
    title: str | None = None
    slug: str | None = None
    source: str | None = None
    stream_url: str | None = None
    is_live: bool | None = None


class PPVEventOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    title: str
    slug: str | None
    description: str | None
    category: str | None
    source: str
    stream_url: str | None
    rtmp_key: str | None
    rtmp_ingest_url: str | None = None
    thumbnails: dict[str, str | None]
    geo_fencing: dict[str, list[str]]
    pricing_plan_id: uuid.UUID | None
    is_active: bool
    is_live: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def set_rtmp_ingest_url(self) -> "PPVEventOut":
        from app.core.config import settings

        if self.source == "rtmp" and settings.RTMP_SERVER_HOST:
            self.rtmp_ingest_url = f"rtmp://{settings.RTMP_SERVER_HOST}/{settings.RTMP_APP_NAME}"
        return self


class PublicPPVEventOut(BaseModel):
    """Storefront-safe PPV event data without RTMP ingest credentials."""
    id: uuid.UUID
    title: str
    slug: str | None
    description: str | None
    category: str | None
    source: str
    stream_url: str | None
    thumbnails: dict[str, str | None]
    geo_fencing: dict[str, list[str]]
    pricing_plan_id: uuid.UUID | None
    is_live: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def refresh_thumbnail_presigned_urls(self) -> "PublicPPVEventOut":
        self.thumbnails = _refresh_thumbnail_urls(self.thumbnails)
        return self


# ─── Video Rental ─────────────────────────────────────────────────────────────

class VideoRentalCreate(BaseModel):
    video_id: uuid.UUID
    rental_price: float
    currency: str = "USD"
    rental_duration_hours: int = 48


class VideoRentalUpdate(BaseModel):
    rental_price: float | None = None
    rental_duration_hours: int | None = None
    is_active: bool | None = None


class VideoRentalOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    video_id: uuid.UUID
    rental_price: float
    currency: str
    rental_duration_hours: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── EPG (Electronic Program Guide) ──────────────────────────────────────────

class EPGProgramCreate(BaseModel):
    video_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    start_time: datetime
    duration_minutes: int = Field(gt=0, description="Duration in minutes (must be > 0)")
    category: str | None = None
    rating: str | None = None
    thumbnail_url: str | None = None
    sort_order: int = 0
    playout_mode: str = "schedule"


class EPGProgramUpdate(BaseModel):
    video_id: uuid.UUID | None = None
    title: str | None = None
    description: str | None = None
    start_time: datetime | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    category: str | None = None
    rating: str | None = None
    thumbnail_url: str | None = None
    sort_order: int | None = None
    playout_mode: str | None = None


class EPGProgramOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    channel_id: uuid.UUID
    video_id: uuid.UUID | None
    title: str
    description: str | None
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    category: str | None
    rating: str | None
    thumbnail_url: str | None
    sort_order: int
    playout_mode: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EPGReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class EPGImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str] = Field(default_factory=list)


# ─── EPG Batch Schedule Save ──────────────────────────────────────────────────

class EPGScheduleProgramItem(BaseModel):
    """A single program item in a batch schedule save request."""
    video_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    duration_minutes: int = Field(gt=0)
    category: str | None = None
    rating: str | None = None
    thumbnail_url: str | None = None


class EPGScheduleSave(BaseModel):
    """
    Batch-save an entire day's schedule for a channel.

    All programs are created sequentially starting from ``schedule_start``.
    Existing programs for that channel's date range are replaced.
    """
    schedule_start: datetime   # UTC datetime — start time of the first program
    playout_mode: str = "schedule"  # "schedule" | "loop"
    programs: list[EPGScheduleProgramItem]
