import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class DemoBookingStatus(str, enum.Enum):
    UNREAD = "unread"
    READ = "read"
    ARCHIVED = "archived"


class DemoBookingRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "demo_booking_requests"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    work_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country_region: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(100), nullable=False)
    project_details: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[DemoBookingStatus] = mapped_column(
        Enum(DemoBookingStatus), default=DemoBookingStatus.UNREAD, nullable=False, index=True
    )
    acknowledged_email_sent_at: Mapped[datetime | None] = mapped_column(nullable=True)

    replies: Mapped[list["DemoBookingReply"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="DemoBookingReply.created_at",
    )


class DemoBookingReply(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "demo_booking_replies"

    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demo_booking_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("admin_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    email_sent_at: Mapped[datetime | None] = mapped_column(nullable=True)

    booking: Mapped["DemoBookingRequest"] = relationship(back_populates="replies")
