"""
Tier-2 support tickets: Super Admin views and manages client-admin tickets.
Routes live under /superadmin/tickets.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.client.ticket import (
    AdminSupportTicket,
    AdminSupportTicketAttachment,
    AdminSupportTicketComment,
    AdminSupportTicketCommentAttachment,
    AdminTicketAuthorType,
)
from app.models.superadmin.client import Client
from app.schemas.client.ticket import (
    AdminSupportTicketListResponse,
    AdminSupportTicketOut,
    AdminSupportTicketSummary,
    AdminTicketCommentOut,
    TicketCommentCreate,
    TicketStatusUpdate,
    admin_ticket_summary_out,
    admin_ticket_detail_out,
)

router = APIRouter()


@router.get("", response_model=AdminSupportTicketListResponse)
async def list_all_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    client_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    base = select(AdminSupportTicket, Client.name.label("client_name")).join(
        Client, AdminSupportTicket.client_id == Client.id
    )
    if status_filter:
        base = base.where(AdminSupportTicket.status == status_filter)
    if client_id:
        base = base.where(AdminSupportTicket.client_id == client_id)

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(
        base.options(selectinload(AdminSupportTicket.attachments))
        .order_by(AdminSupportTicket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = items_result.all()
    items = []
    for ticket, client_name in rows:
        presigned_ticket = admin_ticket_summary_out(ticket)
        ticket_dict = presigned_ticket.model_dump()
        ticket_dict["client_name"] = client_name
        items.append(AdminSupportTicketSummary(**ticket_dict))
    
    return AdminSupportTicketListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{ticket_id}", response_model=AdminSupportTicketOut)
async def get_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(AdminSupportTicket)
        .where(AdminSupportTicket.id == ticket_id)
        .options(
            selectinload(AdminSupportTicket.attachments),
            selectinload(AdminSupportTicket.comments).selectinload(AdminSupportTicketComment.attachments)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return admin_ticket_detail_out(ticket)


@router.patch("/{ticket_id}/status", response_model=AdminSupportTicketOut)
async def update_ticket_status(
    ticket_id: uuid.UUID,
    payload: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(AdminSupportTicket)
        .where(AdminSupportTicket.id == ticket_id)
        .options(
            selectinload(AdminSupportTicket.attachments),
            selectinload(AdminSupportTicket.comments).selectinload(AdminSupportTicketComment.attachments)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.status = payload.status
    await db.commit()
    await db.refresh(ticket)
    return admin_ticket_detail_out(ticket)


@router.post("/{ticket_id}/comments", response_model=AdminTicketCommentOut)
async def add_comment(
    ticket_id: uuid.UUID,
    payload: TicketCommentCreate,
    db: AsyncSession = Depends(get_db),
    superadmin=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(AdminSupportTicket).where(AdminSupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    comment = AdminSupportTicketComment(
        ticket_id=ticket_id,
        author_type=AdminTicketAuthorType.SUPER_ADMIN,
        author_id=superadmin.id,
        message=payload.message,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment
