import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class PartnerDelivery(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_deliveries"
    __table_args__ = (UniqueConstraint("client_id", "partner_id", name="uq_partner_delivery_owner"),)

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), index=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_partners.id"), index=True)
    principal_arn: Mapped[str] = mapped_column(String(255))
    region: Mapped[str] = mapped_column(String(40))
    bucket: Mapped[str] = mapped_column(String(63), unique=True)
    prefix: Mapped[str] = mapped_column(String(255), default="incoming/")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    queue_url: Mapped[str | None] = mapped_column(Text)
    queue_arn: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    options: Mapped[dict] = mapped_column(JSONB, default=dict)


class PartnerIngest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_ingests"
    __table_args__ = (UniqueConstraint("delivery_id", "metadata_key", "version_id", name="uq_partner_ingest_version"),)

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), index=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_partners.id"), index=True)
    delivery_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("partner_deliveries.id"), index=True)
    metadata_key: Mapped[str] = mapped_column(Text)
    version_id: Mapped[str] = mapped_column(String(1024))
    source_modified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[dict] = mapped_column(JSONB, default=dict)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PartnerContent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_content"
    __table_args__ = (UniqueConstraint("client_id", "partner_id", "kind", "sku", name="uq_partner_content_sku"),)

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), index=True)
    partner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_partners.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    sku: Mapped[str] = mapped_column(String(255))
    content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    parent_sku: Mapped[str | None] = mapped_column(String(255))
    season_number: Mapped[int | None] = mapped_column(Integer)
    source_modified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ContentLicense(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_licenses"

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), index=True)
    partner_content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("partner_content.id"), index=True)
    ingest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("partner_ingests.id"), index=True)
    license_type: Mapped[str] = mapped_column(String(20))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    included_countries: Mapped[list] = mapped_column(JSONB, default=list)
    excluded_countries: Mapped[list] = mapped_column(JSONB, default=list)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ContentCaption(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "content_captions"
    __table_args__ = (UniqueConstraint("partner_content_id", "source_filename", "language", "kind", name="uq_partner_caption"),)

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), index=True)
    partner_content_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("partner_content.id"), index=True)
    source_filename: Mapped[str] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(40))
    s3_key: Mapped[str] = mapped_column(Text)