import uuid

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ClientSiteContent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "client_site_content"

    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True)
    menu_management: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    faq_content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    contact_content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    comment: Mapped[str | None] = mapped_column(Text)