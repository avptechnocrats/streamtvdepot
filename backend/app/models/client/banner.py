import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ClientBanner(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "client_banners"
    __table_args__ = (
        UniqueConstraint("id", "client_id", name="uq_client_banners_id_client"),
        Index("ix_client_banners_client_page_position", "client_id", "page", "position"),
        CheckConstraint("page IN ('/', '/movies', '/series', '/tv-shows', '/ppv-events')", name="ck_client_banners_page"),
        CheckConstraint("position IN ('top', 'middle_1', 'middle_2', 'bottom')", name="ck_client_banners_position"),
        CheckConstraint("border_width BETWEEN 0 AND 32 AND border_radius BETWEEN 0 AND 128 AND padding BETWEEN 0 AND 128", name="ck_client_banners_border"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    link: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    page: Mapped[str] = mapped_column(String(32), nullable=False)
    position: Mapped[str] = mapped_column(String(16), nullable=False)
    border_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    border_width: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    border_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#cccccc")
    border_radius: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    padding: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    images: Mapped[list["ClientBannerImage"]] = relationship(cascade="all, delete-orphan", passive_deletes=True, lazy="raise")


class ClientBannerImage(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "client_banner_images"
    __table_args__ = (
        ForeignKeyConstraint(["banner_id", "client_id"], ["client_banners.id", "client_banners.client_id"], ondelete="CASCADE", name="fk_banner_images_banner_tenant"),
        ForeignKeyConstraint(["media_asset_id", "client_id"], ["media_assets.id", "media_assets.client_id"], ondelete="RESTRICT", name="fk_banner_images_asset_tenant"),
        UniqueConstraint("banner_id", "size_variant", name="uq_banner_images_variant"),
        Index("ix_banner_images_media_asset", "media_asset_id", "client_id"),
        CheckConstraint("size_variant IN ('custom', 'desktop', 'tablet', 'mobile')", name="ck_banner_images_variant"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    banner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    media_asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    size_variant: Mapped[str] = mapped_column(String(16), nullable=False)
    asset: Mapped["MediaAsset"] = relationship(lazy="raise", viewonly=True)