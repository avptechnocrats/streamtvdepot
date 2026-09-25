import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class MailDeliveryStatus(str, enum.Enum):
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class SystemMailLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "system_mail_logs"

    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    recipient_name: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[MailDeliveryStatus] = mapped_column(
        Enum(MailDeliveryStatus), default=MailDeliveryStatus.SENT, nullable=False, index=True
    )
    transport: Mapped[str] = mapped_column(String(30), default="smtp", nullable=False)
    config_source: Mapped[str] = mapped_column(String(40), default="env", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)
