"""
Tier-2 support tickets: Client Admin → Super Admin.
Routes live under /admin/support (client admin raising tickets to super admin).
"""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.storage import upload_attachment_to_s3
from app.models.client.ticket import (
    AdminSupportTicket,
    AdminSupportTicketAttachment,
    AdminSupportTicketComment,
    AdminSupportTicketCommentAttachment,
    AdminTicketAuthorType,
)
from app.schemas.client.ticket import (
    AdminSupportTicketListResponse,
    AdminSupportTicketOut,
    AdminSupportTicketSummary,
    AdminTicketCommentOut,
    TicketPriority,
    admin_ticket_detail_out,
    admin_ticket_summary_out,
)

router = APIRouter()

# File upload constants
ALLOWED_FILE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_ATTACHMENTS = 5


@router.get("", response_model=AdminSupportTicketListResponse)
async def list_my_support_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    base = select(AdminSupportTicket).where(
        AdminSupportTicket.client_id == admin._client_id,
        AdminSupportTicket.raised_by == admin.id,
    )
    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(
        base.options(selectinload(AdminSupportTicket.attachments))
        .order_by(AdminSupportTicket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = items_result.scalars().all()
    return AdminSupportTicketListResponse(
        items=[admin_ticket_summary_out(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=AdminSupportTicketOut, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    title: str = Form(...),
    description: str = Form(...),
    priority: TicketPriority = Form(TicketPriority.MEDIUM),
    attachments: list[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    # Validate attachments
    if attachments:
        if len(attachments) > MAX_ATTACHMENTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot attach more than {MAX_ATTACHMENTS} files"
            )
        for file in attachments:
            if file.content_type not in ALLOWED_FILE_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File type {file.content_type} not allowed"
                )
            file_size = 0
            for chunk in file.file:
                file_size += len(chunk)
            file.file.seek(0)
            if file_size > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File {file.filename} exceeds maximum size of {MAX_FILE_BYTES / (1024*1024)}MB"
                )

    ticket = AdminSupportTicket(
        client_id=admin._client_id,
        raised_by=admin.id,
        title=title,
        description=description,
        priority=priority,
    )
    db.add(ticket)
    await db.flush()

    # Upload attachments to S3
    if attachments:
        for file in attachments:
            s3_key = await upload_attachment_to_s3(
                upload_file=file,
                client_slug=str(admin._client_id),
                folder="admin_tickets"
            )
            if s3_key:
                attachment = AdminSupportTicketAttachment(
                    ticket_id=ticket.id,
                    file_url=s3_key,
                    file_name=file.filename,
                    file_type=file.content_type,
                    file_size=file.size or 0,
                )
                db.add(attachment)

    await db.commit()
    await db.refresh(ticket)
    result = await db.execute(
        select(AdminSupportTicket)
        .where(AdminSupportTicket.id == ticket.id)
        .options(
            selectinload(AdminSupportTicket.attachments),
            selectinload(AdminSupportTicket.comments).selectinload(AdminSupportTicketComment.attachments)
        )
    )
    ticket_obj = result.scalar_one()
    return admin_ticket_detail_out(ticket_obj)


@router.get("/{ticket_id}", response_model=AdminSupportTicketOut)
async def get_support_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(AdminSupportTicket)
        .where(
            AdminSupportTicket.id == ticket_id,
            AdminSupportTicket.client_id == admin._client_id,
            AdminSupportTicket.raised_by == admin.id,
        )
        .options(
            selectinload(AdminSupportTicket.attachments),
            selectinload(AdminSupportTicket.comments).selectinload(AdminSupportTicketComment.attachments)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return admin_ticket_detail_out(ticket)


@router.post("/{ticket_id}/comments", response_model=AdminTicketCommentOut, status_code=status.HTTP_201_CREATED)
async def add_comment(
    ticket_id: uuid.UUID,
    message: str = Form(...),
    attachments: list[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(AdminSupportTicket).where(
            AdminSupportTicket.id == ticket_id,
            AdminSupportTicket.client_id == admin._client_id,
            AdminSupportTicket.raised_by == admin.id,
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Validate attachments
    if attachments:
        if len(attachments) > MAX_ATTACHMENTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot attach more than {MAX_ATTACHMENTS} files"
            )
        for file in attachments:
            if file.content_type not in ALLOWED_FILE_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File type {file.content_type} not allowed"
                )
            file_size = 0
            for chunk in file.file:
                file_size += len(chunk)
            file.file.seek(0)
            if file_size > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File {file.filename} exceeds maximum size of {MAX_FILE_BYTES / (1024*1024)}MB"
                )

    comment = AdminSupportTicketComment(
        ticket_id=ticket_id,
        author_type=AdminTicketAuthorType.CLIENT_ADMIN,
        author_id=admin.id,
        message=message,
    )
    db.add(comment)
    await db.flush()

    # Upload attachments to S3
    if attachments:
        for file in attachments:
            s3_key = await upload_attachment_to_s3(
                upload_file=file,
                client_slug=str(admin._client_id),
                folder="admin_ticket_comments"
            )
            if s3_key:
                attachment = AdminSupportTicketCommentAttachment(
                    comment_id=comment.id,
                    file_url=s3_key,
                    file_name=file.filename,
                    file_type=file.content_type,
                    file_size=file.size or 0,
                )
                db.add(attachment)

    await db.commit()
    await db.refresh(comment)
    result = await db.execute(
        select(AdminSupportTicketComment)
        .where(AdminSupportTicketComment.id == comment.id)
        .options(selectinload(AdminSupportTicketComment.attachments))
    )
    comment_obj = result.scalar_one()
    return comment_obj
