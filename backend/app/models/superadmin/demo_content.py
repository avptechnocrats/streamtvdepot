from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, Table
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


# ─── M2M join table ───────────────────────────────────────────────────────────

demo_content_categories = Table(
    "superadmin_demo_content_categories",
    Base.metadata,
    Column("demo_content_id",  UUID(as_uuid=True),
           ForeignKey("superadmin_demo_content.id",  ondelete="CASCADE"), primary_key=True),
    Column("demo_category_id", UUID(as_uuid=True),
           ForeignKey("superadmin_demo_categories.id", ondelete="CASCADE"), primary_key=True),
)


class DemoCategory(Base, UUIDMixin, TimestampMixin):
    """Template category cloned to every new client account."""
    __tablename__ = "superadmin_demo_categories"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    # video | audio | series | live_stream | general
    content_type: Mapped[str | None] = mapped_column(String(20), index=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    thumbnail_s3_key: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    items: Mapped[list["DemoContent"]] = relationship(
        "DemoContent",
        secondary="superadmin_demo_content_categories",
        back_populates="categories",
        lazy="selectin",
    )


class DemoContent(Base, UUIDMixin, TimestampMixin):
    """Template content item cloned to every new client account."""
    __tablename__ = "superadmin_demo_content"

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    # video | audio | series | live_stream
    content_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    stream_url: Mapped[str | None] = mapped_column(Text)         # null for series (episodes carry URLs)
    # Platform-owned immutable S3 keys. These are never owned by a tenant.
    stream_s3_key: Mapped[str | None] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    thumbnail_s3_key: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    short_description: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    genre: Mapped[str | None] = mapped_column(String(100))
    language: Mapped[str | None] = mapped_column(String(100))
    artist: Mapped[str | None] = mapped_column(String(255))      # audio
    album: Mapped[str | None] = mapped_column(String(255))       # audio
    age_rating: Mapped[str | None] = mapped_column(String(20))   # video
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    transcode_status: Mapped[str | None] = mapped_column(String(20), index=True)
    transcode_job_id: Mapped[str | None] = mapped_column(String(255))
    transcode_progress: Mapped[int | None] = mapped_column(Integer)
    hls_manifest_key: Mapped[str | None] = mapped_column(Text)
    hls_url: Mapped[str | None] = mapped_column(Text)
    # type-specific extras; for series: {"episodes": [{title, season, episode, stream_url, thumbnail_url, duration_seconds}]}
    # for live_stream: {"is_live": false, "source": "external"}
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    categories: Mapped[list["DemoCategory"]] = relationship(
        "DemoCategory",
        secondary="superadmin_demo_content_categories",
        back_populates="items",
        lazy="selectin",
    )
