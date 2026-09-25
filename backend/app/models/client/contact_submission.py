import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ContactSubmissionStatus(str, enum.Enum):
    UNREAD = "unread"
    READ = "read"
    ARCHIVED = "archived"


class ContactSubmission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "contact_submissions"

    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    work_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ContactSubmissionStatus] = mapped_column(
        Enum(ContactSubmissionStatus), default=ContactSubmissionStatus.UNREAD, nullable=False, index=True
    )