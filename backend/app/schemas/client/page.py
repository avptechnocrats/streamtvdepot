import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

RESERVED_SLUGS = {"contact-us", "faq"}


def _reject_reserved(slug: str) -> str:
    if slug.lower() in RESERVED_SLUGS:
        raise ValueError(f"'{slug}' is reserved for a built-in page and cannot be used.")
    return slug.lower()


class PageBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")
    body: str | None = None
    short_description: str | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    seo_keywords: str | None = None
    og_image_url: str | None = None
    status: str = Field("draft", pattern=r"^(draft|published)$")
    is_active: bool = True
    sort_order: int = 0

    @field_validator("slug")
    @classmethod
    def slug_lowercase(cls, v: str) -> str:
        return _reject_reserved(v)


class PageCreate(PageBase):
    pass


class PageUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, min_length=1, max_length=255, pattern=r"^[a-z0-9-]+$")
    body: str | None = None
    short_description: str | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    seo_keywords: str | None = None
    og_image_url: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|published)$")
    is_active: bool | None = None
    sort_order: int | None = None

    @field_validator("slug")
    @classmethod
    def slug_lowercase(cls, v: str | None) -> str | None:
        return _reject_reserved(v) if v else v


class PageOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    title: str
    slug: str
    body: str | None
    short_description: str | None
    seo_title: str | None
    seo_description: str | None
    seo_keywords: str | None
    og_image_url: str | None
    status: str
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicPageOut(BaseModel):
    """Slimmed-down page response for public (storefront) consumption."""

    id: uuid.UUID
    title: str
    slug: str
    body: str | None
    short_description: str | None
    seo_title: str | None
    seo_description: str | None
    seo_keywords: str | None
    og_image_url: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
