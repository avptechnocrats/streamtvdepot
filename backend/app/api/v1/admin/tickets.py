"""
Tier-1 support tickets: Client Admin views and manages end-user tickets.
Routes live under /admin/tickets.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.ticket import (
    SupportTicket,
    SupportTicketAttachment,
    SupportTicketComment,
    SupportTicketCommentAttachment,
    TicketAuthorType,
)
from app.models.client.user import EndUser
from app.schemas.client.ticket import (
    SupportTicketListResponse,
    SupportTicketOut,
    TicketCommentCreate,
    TicketCommentOut,
    TicketStatusUpdate,
    ticket_detail_out,
    ticket_summary_out,
)

router = APIRouter()


@router.get("", response_model=SupportTicketListResponse)
async def list_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = Query(None, description="Search by ticket subject or user name"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    base = (
        select(SupportTicket, EndUser.full_name, EndUser.email)
        .join(EndUser, SupportTicket.raised_by == EndUser.id)
        .where(SupportTicket.client_id == admin._client_id)
    )
    if status_filter:
        base = base.where(SupportTicket.status == status_filter)
    if q:
        like = f"%{q}%"
        base = base.where(
            (SupportTicket.title.ilike(like)) | (EndUser.full_name.ilike(like))
        )

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(
        base.order_by(SupportTicket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .options(selectinload(SupportTicket.attachments))
    )
    rows = items_result.all()
    return SupportTicketListResponse(
        items=[ticket_summary_out(t, name, email) for t, name, email in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{ticket_id}", response_model=SupportTicketOut)
async def get_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(SupportTicket, EndUser.full_name, EndUser.email)
        .join(EndUser, SupportTicket.raised_by == EndUser.id)
        .where(
            SupportTicket.id == ticket_id,
            SupportTicket.client_id == admin._client_id,
        )
        .options(
            selectinload(SupportTicket.comments).selectinload(SupportTicketComment.attachments),
            selectinload(SupportTicket.attachments)
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket, name, email = row
    return ticket_detail_out(ticket, name, email)


@router.patch("/{ticket_id}/status", response_model=SupportTicketOut)
async def update_ticket_status(
    ticket_id: uuid.UUID,
    payload: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(SupportTicket)
        .where(
            SupportTicket.id == ticket_id,
            SupportTicket.client_id == admin._client_id,
        )
        .options(
            selectinload(SupportTicket.comments).selectinload(SupportTicketComment.attachments),
            selectinload(SupportTicket.attachments)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.status = payload.status
    await db.commit()
    await db.refresh(ticket)

    user_result = await db.execute(
        select(EndUser.full_name, EndUser.email).where(EndUser.id == ticket.raised_by)
    )
    name, email = user_result.first() or (None, None)
    return ticket_detail_out(ticket, name, email)


@router.post("/{ticket_id}/comments", response_model=TicketCommentOut, status_code=status.HTTP_201_CREATED)
async def add_comment(
    ticket_id: uuid.UUID,
    payload: TicketCommentCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id,
            SupportTicket.client_id == admin._client_id,
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    comment = SupportTicketComment(
        ticket_id=ticket_id,
        author_type=TicketAuthorType.CLIENT_ADMIN,
        author_id=admin.id,
        message=payload.message,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment
