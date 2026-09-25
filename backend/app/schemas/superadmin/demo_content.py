import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

DemoContentType = Literal["video", "audio", "series", "live_stream"]


# ─── Episode (embedded in series extra_data) ──────────────────────────────────

class DemoEpisode(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    season_number: int = Field(default=1, ge=1)
    episode_number: int = Field(..., ge=1)
    stream_url: str = Field(..., min_length=5)
    thumbnail_url: str | None = None
    duration_seconds: int | None = Field(None, ge=0)
    description: str | None = None


# ─── Demo Category (brief, for embedding inside DemoContentOut) ───────────────

class DemoCategoryBrief(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    content_type: str | None

    model_config = {"from_attributes": True}


# ─── Create / Update ──────────────────────────────────────────────────────────

class DemoContentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content_type: DemoContentType
    stream_url: str | None = Field(None, min_length=5)   # null for series
    thumbnail_url: str | None = None
    description: str | None = Field(None, max_length=5000)
    short_description: str | None = Field(None, max_length=500)
    duration_seconds: int | None = Field(None, ge=0)
    genre: str | None = Field(None, max_length=100)
    language: str | None = Field(None, max_length=100)
    artist: str | None = Field(None, max_length=255)
    album: str | None = Field(None, max_length=255)
    age_rating: str | None = Field(None, max_length=20)
    is_featured: bool = False
    # For series: {"episodes": [DemoEpisode]}
    # For live_stream: {"source": "external"}
    extra_data: dict[str, Any] = {}
    category_ids: list[uuid.UUID] = []


class DemoContentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    stream_url: str | None = None
    thumbnail_url: str | None = None
    description: str | None = None
    short_description: str | None = None
    duration_seconds: int | None = None
    genre: str | None = None
    language: str | None = None
    artist: str | None = None
    album: str | None = None
    age_rating: str | None = None
    is_featured: bool | None = None
    extra_data: dict[str, Any] | None = None
    category_ids: list[uuid.UUID] | None = None


# ─── Out ──────────────────────────────────────────────────────────────────────

class DemoContentOut(BaseModel):
    id: uuid.UUID
    title: str
    content_type: str
    stream_url: str | None
    thumbnail_url: str | None
    description: str | None
    short_description: str | None
    duration_seconds: int | None
    genre: str | None
    language: str | None
    artist: str | None
    album: str | None
    age_rating: str | None
    is_featured: bool
    extra_data: dict[str, Any]
    categories: list[DemoCategoryBrief]
    created_at: datetime

    model_config = {"from_attributes": True}
