import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DemoContentType = Literal["video", "audio"]


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
    stream_url: str | None = Field(None, min_length=5)
    stream_s3_key: str | None = None
    thumbnail_url: str | None = None
    thumbnail_s3_key: str | None = None
    description: str | None = Field(None, max_length=5000)
    short_description: str | None = Field(None, max_length=500)
    duration_seconds: int | None = Field(None, ge=0)
    genre: str | None = Field(None, max_length=100)
    language: str | None = Field(None, max_length=100)
    artist: str | None = Field(None, max_length=255)
    album: str | None = Field(None, max_length=255)
    age_rating: str | None = Field(None, max_length=20)
    is_featured: bool = False
    status: Literal["draft", "published"] = "draft"
    extra_data: dict[str, object] = {}
    category_ids: list[uuid.UUID] = []


class DemoContentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    stream_url: str | None = None
    stream_s3_key: str | None = None
    thumbnail_url: str | None = None
    thumbnail_s3_key: str | None = None
    description: str | None = None
    short_description: str | None = None
    duration_seconds: int | None = None
    genre: str | None = None
    language: str | None = None
    artist: str | None = None
    album: str | None = None
    age_rating: str | None = None
    is_featured: bool | None = None
    status: Literal["draft", "published"] | None = None
    extra_data: dict[str, object] | None = None
    category_ids: list[uuid.UUID] | None = None


# ─── Out ──────────────────────────────────────────────────────────────────────

class DemoContentOut(BaseModel):
    id: uuid.UUID
    title: str
    content_type: str
    stream_url: str | None
    stream_s3_key: str | None
    thumbnail_url: str | None
    thumbnail_s3_key: str | None
    description: str | None
    short_description: str | None
    duration_seconds: int | None
    genre: str | None
    language: str | None
    artist: str | None
    album: str | None
    age_rating: str | None
    is_featured: bool
    status: Literal["draft", "published"]
    transcode_status: Literal["pending", "processing", "complete", "failed"] | None
    transcode_progress: int | None
    hls_url: str | None
    extra_data: dict[str, object]
    categories: list[DemoCategoryBrief]
    created_at: datetime

    model_config = {"from_attributes": True}


class DemoContentPage(BaseModel):
    items: list[DemoContentOut]
    page: int
    page_size: int
    total: int
    has_more: bool
