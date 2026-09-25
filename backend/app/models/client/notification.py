import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class NotificationType(str, enum.Enum):
    NEW_CONTENT = "new_content"
    SUBSCRIPTION_RENEWAL = "subscription_renewal"
    SUBSCRIPTION_EXPIRY = "subscription_expiry"
    RENTAL_EXPIRY = "rental_expiry"
    PAYMENT_SUCCESS = "payment_success"
    PAYMENT_FAILED = "payment_failed"
    PROMOTIONAL = "promotional"
    SYSTEM = "system"


class UserNotification(Base, UUIDMixin, TimestampMixin):
    """Per-user notification records for an OTT client platform."""

    __tablename__ = "user_notifications"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional deep-link URL (e.g. /movies/<id> or /account/subscriptions)
    action_url: Mapped[str | None] = mapped_column(String(500))
    # Optional thumbnail/poster image for the notification card
    image_url: Mapped[str | None] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
