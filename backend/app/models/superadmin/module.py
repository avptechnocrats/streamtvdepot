from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Module(Base, UUIDMixin, TimestampMixin):
    """Feature modules that can be toggled per client."""

    __tablename__ = "modules"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    client_modules: Mapped[list["ClientModule"]] = relationship(back_populates="module")


# ─── Default modules seeded at startup ───────────────────────────────────────
DEFAULT_MODULES = [
    {"name": "Audio", "slug": "audio", "description": "Audio content management"},
    {"name": "Video", "slug": "video", "description": "Video on demand"},
    {"name": "Series", "slug": "series", "description": "TV series / episodes"},
    {"name": "Live Streaming", "slug": "live_streaming", "description": "Live TV channels"},
    {"name": "PPV Events", "slug": "ppv", "description": "Pay-per-view events"},
    {"name": "Video on Rent", "slug": "rental", "description": "Video rental"},
    {"name": "Advertisement", "slug": "advertisement", "description": "Ad management"},
    {"name": "Analytics", "slug": "analytics", "description": "Usage analytics"},
]
