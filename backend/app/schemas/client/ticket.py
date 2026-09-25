import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.client.ticket import (
    AdminTicketAuthorType,
    TicketAuthorType,
    TicketPriority,
    TicketStatus,
)


# ─── Tier-1: End User ↔ Client Admin ─────────────────────────────────────────

class TicketAttachmentOut(BaseModel):
    id: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketCommentAttachmentOut(BaseModel):
    id: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketCommentOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    author_type: TicketAuthorType
    author_id: uuid.UUID
    message: str
    created_at: datetime
    attachments: list[TicketCommentAttachmentOut] = []

    model_config = {"from_attributes": True}


class SupportTicketCreate(BaseModel):
    title: str
    description: str
    priority: TicketPriority = TicketPriority.MEDIUM


class SupportTicketOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    raised_by: uuid.UUID
    raised_by_name: Optional[str] = None
    raised_by_email: Optional[str] = None
    title: str
    description: str
    status: TicketStatus
    priority: TicketPriority
    created_at: datetime
    updated_at: datetime
    attachments: list[TicketAttachmentOut] = []
    comments: list[TicketCommentOut] = []

    model_config = {"from_attributes": True}


class SupportTicketSummary(BaseModel):
    id: uuid.UUID
    raised_by: uuid.UUID
    raised_by_name: Optional[str] = None
    raised_by_email: Optional[str] = None
    title: str
    status: TicketStatus
    priority: TicketPriority
    created_at: datetime
    updated_at: datetime
    attachments: list[TicketAttachmentOut] = []

    model_config = {"from_attributes": True}


class SupportTicketListResponse(BaseModel):
    items: list[SupportTicketSummary]
    total: int
    page: int
    page_size: int


def presign_attachment(attachment: TicketAttachmentOut) -> TicketAttachmentOut:
    """Presign attachment file URL if it's an S3 key."""
    if not attachment.file_url.startswith("http://") and not attachment.file_url.startswith("https://"):
        from app.core.storage import presign_get_url
        attachment.file_url = presign_get_url(attachment.file_url)
    return attachment


def presign_comment_attachment(attachment: TicketCommentAttachmentOut) -> TicketCommentAttachmentOut:
    """Presign comment attachment file URL if it's an S3 key."""
    if not attachment.file_url.startswith("http://") and not attachment.file_url.startswith("https://"):
        from app.core.storage import presign_get_url
        attachment.file_url = presign_get_url(attachment.file_url)
    return attachment


def ticket_summary_out(
    ticket, raised_by_name: Optional[str] = None, raised_by_email: Optional[str] = None
) -> SupportTicketSummary:
    out = SupportTicketSummary.model_validate(ticket)
    out.attachments = [presign_attachment(att) for att in out.attachments]
    out.raised_by_name = raised_by_name
    out.raised_by_email = raised_by_email
    return out


def ticket_detail_out(
    ticket, raised_by_name: Optional[str] = None, raised_by_email: Optional[str] = None
) -> SupportTicketOut:
    out = SupportTicketOut.model_validate(ticket)
    out.attachments = [presign_attachment(att) for att in out.attachments]
    for comment in out.comments:
        comment.attachments = [presign_comment_attachment(att) for att in comment.attachments]
    out.raised_by_name = raised_by_name
    out.raised_by_email = raised_by_email
    return out


class TicketCommentCreate(BaseModel):
    message: str


class TicketStatusUpdate(BaseModel):
    status: TicketStatus


# ─── Tier-2: Client Admin ↔ Super Admin ──────────────────────────────────────

class AdminTicketAttachmentOut(BaseModel):
    id: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminTicketCommentAttachmentOut(BaseModel):
    id: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminTicketCommentOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    author_type: AdminTicketAuthorType
    author_id: uuid.UUID
    message: str
    created_at: datetime
    attachments: list[AdminTicketCommentAttachmentOut] = []

    model_config = {"from_attributes": True}


class AdminSupportTicketCreate(BaseModel):
    title: str
    description: str
    priority: TicketPriority = TicketPriority.MEDIUM


class AdminSupportTicketOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    raised_by: uuid.UUID
    title: str
    description: str
    status: TicketStatus
    priority: TicketPriority
    created_at: datetime
    updated_at: datetime
    attachments: list[AdminTicketAttachmentOut] = []
    comments: list[AdminTicketCommentOut] = []

    model_config = {"from_attributes": True}


class AdminSupportTicketSummary(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    client_name: str = ""
    raised_by: uuid.UUID
    title: str
    status: TicketStatus
    priority: TicketPriority
    created_at: datetime
    updated_at: datetime
    attachments: list[AdminTicketAttachmentOut] = []

    model_config = {"from_attributes": True}


class AdminSupportTicketListResponse(BaseModel):
    items: list[AdminSupportTicketSummary]
    total: int
    page: int
    page_size: int


def presign_admin_attachment(attachment: AdminTicketAttachmentOut) -> AdminTicketAttachmentOut:
    """Presign admin ticket attachment file URL if it's an S3 key."""
    if not attachment.file_url.startswith("http://") and not attachment.file_url.startswith("https://"):
        from app.core.storage import presign_get_url
        attachment.file_url = presign_get_url(attachment.file_url)
    return attachment


def presign_admin_comment_attachment(attachment: AdminTicketCommentAttachmentOut) -> AdminTicketCommentAttachmentOut:
    """Presign admin comment attachment file URL if it's an S3 key."""
    if not attachment.file_url.startswith("http://") and not attachment.file_url.startswith("https://"):
        from app.core.storage import presign_get_url
        attachment.file_url = presign_get_url(attachment.file_url)
    return attachment


def admin_ticket_summary_out(ticket) -> AdminSupportTicketSummary:
    out = AdminSupportTicketSummary.model_validate(ticket)
    out.attachments = [presign_admin_attachment(att) for att in out.attachments]
    return out


def admin_ticket_detail_out(ticket) -> AdminSupportTicketOut:
    out = AdminSupportTicketOut.model_validate(ticket)
    out.attachments = [presign_admin_attachment(att) for att in out.attachments]
    for comment in out.comments:
        comment.attachments = [presign_admin_comment_attachment(att) for att in comment.attachments]
    return out
