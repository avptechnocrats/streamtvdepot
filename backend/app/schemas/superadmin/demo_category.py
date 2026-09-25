import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DemoCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    content_type: str | None = Field(None, pattern=r"^(video|audio|series|live_stream|general)$")
    thumbnail_url: str | None = None
    sort_order: int = 0


class DemoCategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    content_type: str | None = None
    thumbnail_url: str | None = None
    sort_order: int | None = None


class DemoCategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    content_type: str | None
    thumbnail_url: str | None
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}
