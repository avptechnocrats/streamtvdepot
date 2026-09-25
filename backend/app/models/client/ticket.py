import enum
import uuid
from typing import Optional

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


# ─── Tier-1: End User → Client Admin ─────────────────────────────────────────

class TicketStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TicketAuthorType(str, enum.Enum):
    END_USER = "end_user"
    CLIENT_ADMIN = "client_admin"


class SupportTicket(Base, UUIDMixin, TimestampMixin):
    """Support tickets raised by end users, handled by client admins."""

    __tablename__ = "support_tickets"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    raised_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus), default=TicketStatus.OPEN, nullable=False, index=True
    )
    priority: Mapped[TicketPriority] = mapped_column(
        Enum(TicketPriority), default=TicketPriority.MEDIUM, nullable=False
    )

    comments: Mapped[list["SupportTicketComment"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="SupportTicketComment.created_at"
    )
    attachments: Mapped[list["SupportTicketAttachment"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="SupportTicketAttachment.created_at"
    )


class SupportTicketAttachment(Base, UUIDMixin, TimestampMixin):
    """File attachment on an end-user support ticket."""

    __tablename__ = "support_ticket_attachments"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    ticket: Mapped["SupportTicket"] = relationship(back_populates="attachments")


class SupportTicketComment(Base, UUIDMixin, TimestampMixin):
    """Comment on an end-user support ticket."""

    __tablename__ = "support_ticket_comments"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_type: Mapped[TicketAuthorType] = mapped_column(
        Enum(TicketAuthorType), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    ticket: Mapped["SupportTicket"] = relationship(back_populates="comments")
    attachments: Mapped[list["SupportTicketCommentAttachment"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan", order_by="SupportTicketCommentAttachment.created_at"
    )


class SupportTicketCommentAttachment(Base, UUIDMixin, TimestampMixin):
    """File attachment on a support ticket comment."""

    __tablename__ = "support_ticket_comment_attachments"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_ticket_comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    comment: Mapped["SupportTicketComment"] = relationship(back_populates="attachments")


# ─── Tier-2: Client Admin → Super Admin ──────────────────────────────────────

class AdminTicketAuthorType(str, enum.Enum):
    CLIENT_ADMIN = "client_admin"
    SUPER_ADMIN = "super_admin"


class AdminSupportTicket(Base, UUIDMixin, TimestampMixin):
    """Support tickets raised by client admins, handled by super admins."""

    __tablename__ = "admin_support_tickets"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    raised_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_admin_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[TicketStatus] = mapped_column(
        Enum(TicketStatus), default=TicketStatus.OPEN, nullable=False, index=True
    )
    priority: Mapped[TicketPriority] = mapped_column(
        Enum(TicketPriority), default=TicketPriority.MEDIUM, nullable=False
    )

    comments: Mapped[list["AdminSupportTicketComment"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="AdminSupportTicketComment.created_at"
    )
    attachments: Mapped[list["AdminSupportTicketAttachment"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="AdminSupportTicketAttachment.created_at"
    )


class AdminSupportTicketAttachment(Base, UUIDMixin, TimestampMixin):
    """File attachment on an admin support ticket."""

    __tablename__ = "admin_support_ticket_attachments"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_support_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    ticket: Mapped["AdminSupportTicket"] = relationship(back_populates="attachments")


class AdminSupportTicketComment(Base, UUIDMixin, TimestampMixin):
    """Comment on an admin support ticket."""

    __tablename__ = "admin_support_ticket_comments"

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_support_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_type: Mapped[AdminTicketAuthorType] = mapped_column(
        Enum(AdminTicketAuthorType), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    ticket: Mapped["AdminSupportTicket"] = relationship(back_populates="comments")
    attachments: Mapped[list["AdminSupportTicketCommentAttachment"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan", order_by="AdminSupportTicketCommentAttachment.created_at"
    )


class AdminSupportTicketCommentAttachment(Base, UUIDMixin, TimestampMixin):
    """File attachment on an admin support ticket comment."""

    __tablename__ = "admin_support_ticket_comment_attachments"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_support_ticket_comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)

    comment: Mapped["AdminSupportTicketComment"] = relationship(back_populates="attachments")
