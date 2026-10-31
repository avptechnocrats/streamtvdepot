from typing import Literal
from uuid import UUID
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

BannerPage = Literal["/", "/movies", "/series", "/tv-shows", "/ppv-events"]
BannerPosition = Literal["top", "middle_1", "middle_2", "bottom"]


class BannerImage(BaseModel):
    url: HttpUrl
    display_url: HttpUrl | None = None
    asset_id: UUID
    width: int = Field(gt=0, le=4096)
    height: int = Field(gt=0, le=4096)


class BannerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    link: str | None = Field(None, max_length=2048)
    page: BannerPage
    position: BannerPosition
    images: dict[Literal["desktop", "tablet", "custom", "mobile"], BannerImage]
    border_enabled: bool = False
    border_width: int = Field(1, ge=0, le=32)
    border_color: str = Field("#cccccc", pattern=r"^#[0-9a-fA-F]{6}$")
    border_radius: int = Field(0, ge=0, le=128)
    padding: int = Field(0, ge=0, le=128)

    @field_validator("link", mode="before")
    @classmethod
    def validate_link(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Link must be a URL or site-relative path")
        value = value.strip()
        if not value:
            return None
        if "\\" in value or any(ord(character) <= 32 or ord(character) == 127 for character in value):
            raise ValueError("Link contains invalid characters")
        if value.startswith("/") and not value.startswith("//"):
            return value
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username is not None or parsed.password is not None:
            raise ValueError("Use an HTTP/HTTPS URL or a site-relative path")
        return value

    @model_validator(mode="after")
    def validate_banner(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("Banner name is required")
        if not self.images:
            raise ValueError("Upload at least one banner image")
        dimensions = {"desktop": (1920, 600), "tablet": (1200, 400), "mobile": (750, 500)}
        for slot, image in self.images.items():
            if slot != "custom" and (image.width, image.height) != dimensions[slot]:
                raise ValueError(f"Invalid dimensions for {slot} banner")
        return self


class BannerOut(BannerIn):
    id: UUID