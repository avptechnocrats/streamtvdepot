"""
Tier-1 support tickets: raised by end users, handled by client admins.
Routes live under /auth/user/tickets (authenticated as end_user).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.storage import upload_attachment_to_s3
from app.core.database import get_db
from app.core.dependencies import get_current_end_user
from app.models.client.ticket import (
    SupportTicket,
    SupportTicketAttachment,
    SupportTicketComment,
    SupportTicketCommentAttachment,
    TicketAuthorType,
    TicketPriority,
)
from app.schemas.client.ticket import (
    SupportTicketListResponse,
    SupportTicketOut,
    TicketCommentCreate,
    TicketCommentOut,
    ticket_detail_out,
    ticket_summary_out,
)

router = APIRouter()

ALLOWED_FILE_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_ATTACHMENTS = 5


@router.get("", response_model=SupportTicketListResponse)
async def list_my_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    base = select(SupportTicket).where(
        SupportTicket.client_id == current_user._client_id,
        SupportTicket.raised_by == current_user.id,
    )
    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(
        base.order_by(SupportTicket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(selectinload(SupportTicket.attachments))
    )
    items = items_result.scalars().all()
    return SupportTicketListResponse(
        items=[ticket_summary_out(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=SupportTicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    title: str = Form(...),
    description: str = Form(...),
    priority: str = Form("medium"),
    attachments: list[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    try:
        ticket_priority = TicketPriority(priority)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid priority")

    # Create ticket
    ticket = SupportTicket(
        client_id=current_user._client_id,
        raised_by=current_user.id,
        title=title,
        description=description,
        priority=ticket_priority,
    )
    db.add(ticket)
    await db.flush()

    # Handle multiple attachments
    if attachments and any(f.filename for f in attachments):
        valid_attachments = [f for f in attachments if f.filename]
        if len(valid_attachments) > MAX_ATTACHMENTS:
            raise HTTPException(
                status_code=422, 
                detail=f"Maximum {MAX_ATTACHMENTS} attachments allowed."
            )
        
        client_slug = getattr(current_user, "_client_slug", "") or str(current_user._client_id)
        for file in valid_attachments:
            if (file.content_type or "").lower() not in ALLOWED_FILE_TYPES:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unsupported file type for {file.filename}. Use JPEG, PNG, WebP, GIF or PDF.",
                )
            if file.size is not None and file.size > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=422, 
                    detail=f"File {file.filename} must be 10 MB or smaller."
                )
            
            file_url = await upload_attachment_to_s3(file, client_slug)
            if not file_url:
                raise HTTPException(
                    status_code=502, 
                    detail=f"Could not upload attachment {file.filename}."
                )
            
            attachment = SupportTicketAttachment(
                ticket_id=ticket.id,
                file_url=file_url,
                file_name=file.filename,
                file_type=file.content_type or "application/octet-stream",
                file_size=file.size or 0,
            )
            db.add(attachment)

    await db.commit()
    await db.refresh(ticket)
    result = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.id == ticket.id)
        .options(selectinload(SupportTicket.comments), selectinload(SupportTicket.attachments))
    )
    return ticket_detail_out(result.scalar_one())


@router.get("/{ticket_id}", response_model=SupportTicketOut)
async def get_my_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    result = await db.execute(
        select(SupportTicket)
        .where(
            SupportTicket.id == ticket_id,
            SupportTicket.client_id == current_user._client_id,
            SupportTicket.raised_by == current_user.id,
        )
        .options(
            selectinload(SupportTicket.comments).selectinload(SupportTicketComment.attachments),
            selectinload(SupportTicket.attachments)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket_detail_out(ticket)


@router.post("/{ticket_id}/comments", response_model=TicketCommentOut, status_code=status.HTTP_201_CREATED)
async def add_comment(
    ticket_id: uuid.UUID,
    message: str = Form(...),
    attachments: list[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    result = await db.execute(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id,
            SupportTicket.client_id == current_user._client_id,
            SupportTicket.raised_by == current_user.id,
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Create comment
    comment = SupportTicketComment(
        ticket_id=ticket_id,
        author_type=TicketAuthorType.END_USER,
        author_id=current_user.id,
        message=message,
    )
    db.add(comment)
    await db.flush()

    # Handle attachments
    if attachments and any(f.filename for f in attachments):
        valid_attachments = [f for f in attachments if f.filename]
        if len(valid_attachments) > MAX_ATTACHMENTS:
            raise HTTPException(
                status_code=422, 
                detail=f"Maximum {MAX_ATTACHMENTS} attachments allowed."
            )
        
        client_slug = getattr(current_user, "_client_slug", "") or str(current_user._client_id)
        for file in valid_attachments:
            if (file.content_type or "").lower() not in ALLOWED_FILE_TYPES:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unsupported file type for {file.filename}. Use JPEG, PNG, WebP, GIF or PDF.",
                )
            if file.size is not None and file.size > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=422, 
                    detail=f"File {file.filename} must be 10 MB or smaller."
                )
            
            file_url = await upload_attachment_to_s3(file, client_slug)
            if not file_url:
                raise HTTPException(
                    status_code=502, 
                    detail=f"Could not upload attachment {file.filename}."
                )
            
            attachment = SupportTicketCommentAttachment(
                comment_id=comment.id,
                file_url=file_url,
                file_name=file.filename,
                file_type=file.content_type or "application/octet-stream",
                file_size=file.size or 0,
            )
            db.add(attachment)

    await db.commit()
    await db.refresh(comment)
    result = await db.execute(
        select(SupportTicketComment)
        .where(SupportTicketComment.id == comment.id)
        .options(selectinload(SupportTicketComment.attachments))
    )
    return result.scalar_one()
