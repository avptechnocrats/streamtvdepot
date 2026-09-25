import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ClientPage(Base, UUIDMixin, TimestampMixin):
    """Static page owned by a client (privacy policy, T&C, FAQ, etc.)."""

    __tablename__ = "client_pages"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Core content
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    body: Mapped[str | None] = mapped_column(Text)           # HTML from rich-text editor
    short_description: Mapped[str | None] = mapped_column(Text)

    # SEO / meta
    seo_title: Mapped[str | None] = mapped_column(String(255))
    seo_description: Mapped[str | None] = mapped_column(Text)
    seo_keywords: Mapped[str | None] = mapped_column(Text)   # comma-separated tags
    og_image_url: Mapped[str | None] = mapped_column(Text)   # open-graph image URL

    # Visibility
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)   # draft | published
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
