import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DemoCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    content_type: str | None = Field(None, pattern=r"^(video|audio|channel|general)$")
    thumbnail_url: str | None = None
    thumbnail_s3_key: str | None = None
    status: Literal["draft", "published"] = "draft"
    sort_order: int = 0


class DemoCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    content_type: str | None = Field(None, pattern=r"^(video|audio|channel|general)$")
    thumbnail_url: str | None = None
    thumbnail_s3_key: str | None = None
    status: Literal["draft", "published"] | None = None
    sort_order: int | None = None


class DemoCategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    content_type: str | None
    thumbnail_url: str | None
    thumbnail_s3_key: str | None
    status: Literal["draft", "published"]
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}
