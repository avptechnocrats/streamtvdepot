import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.core.system_mail import send_system_email
from app.models.superadmin.demo_booking import (
    DemoBookingReply,
    DemoBookingRequest,
    DemoBookingStatus,
)
from app.schemas.superadmin.demo_booking import (
    DemoBookingDetail,
    DemoBookingListCounts,
    DemoBookingListResponse,
    DemoBookingReplyCreate,
    DemoBookingReplyOut,
    DemoBookingSummary,
)

router = APIRouter()


def _build_reply_email_html(full_name: str, message: str) -> str:
    safe_name = full_name or "there"
    formatted = message.replace("\n", "<br>")
    return (
        f"<p>Hi {safe_name},</p>"
        f"<p>Thanks for your demo request. Our team replied:</p>"
        f"<blockquote style='margin:12px 0;padding:12px;border-left:3px solid #CBD5E1;background:#F8FAFC'>{formatted}</blockquote>"
        "<p>If you have more questions, reply to this email and we will help you.</p>"
        "<p>Regards,<br>StreamTVDepot Team</p>"
    )


@router.get("", response_model=DemoBookingListResponse)
async def list_demo_bookings(
    tab: str = Query("all", description="all | unread | read | archived"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    tab_key = (tab or "all").strip().lower()
    if tab_key not in {"all", "unread", "read", "archived"}:
        raise HTTPException(status_code=422, detail="Invalid tab filter")

    status_map = {
        "unread": DemoBookingStatus.UNREAD,
        "read": DemoBookingStatus.READ,
        "archived": DemoBookingStatus.ARCHIVED,
    }

    base = select(DemoBookingRequest)
    if tab_key in status_map:
        base = base.where(DemoBookingRequest.status == status_map[tab_key])

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(
        base.order_by(DemoBookingRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = items_result.scalars().all()

    grouped_result = await db.execute(
        select(DemoBookingRequest.status, func.count())
        .group_by(DemoBookingRequest.status)
    )
    grouped = {k.value if hasattr(k, "value") else str(k): v for k, v in grouped_result.all()}
    unread_count = int(grouped.get("unread", 0))
    read_count = int(grouped.get("read", 0))
    archived_count = int(grouped.get("archived", 0))

    return DemoBookingListResponse(
        items=[DemoBookingSummary.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        counts=DemoBookingListCounts(
            all=unread_count + read_count + archived_count,
            unread=unread_count,
            read=read_count,
            archived=archived_count,
        ),
    )


@router.get("/{booking_id}", response_model=DemoBookingDetail)
async def get_demo_booking(
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(DemoBookingRequest)
        .where(DemoBookingRequest.id == booking_id)
        .options(selectinload(DemoBookingRequest.replies))
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Demo booking request not found")

    if booking.status == DemoBookingStatus.UNREAD:
        booking.status = DemoBookingStatus.READ
        await db.commit()
        await db.refresh(booking)

    return booking


@router.patch("/{booking_id}/archive", response_model=DemoBookingDetail)
async def archive_demo_booking(
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(DemoBookingRequest)
        .where(DemoBookingRequest.id == booking_id)
        .options(selectinload(DemoBookingRequest.replies))
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Demo booking request not found")

    booking.status = DemoBookingStatus.ARCHIVED
    await db.commit()
    await db.refresh(booking)
    return booking


@router.post(
    "/{booking_id}/reply",
    response_model=DemoBookingReplyOut,
    status_code=status.HTTP_201_CREATED,
)
async def reply_demo_booking(
    booking_id: uuid.UUID,
    payload: DemoBookingReplyCreate,
    db: AsyncSession = Depends(get_db),
    superadmin=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(DemoBookingRequest)
        .where(DemoBookingRequest.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Demo booking request not found")
    if booking.status == DemoBookingStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Cannot reply to archived request")

    sent = await send_system_email(
        db,
        event_key="demo_booking_reply",
        to_email=booking.work_email,
        to_name=booking.full_name,
        subject="Reply to your StreamTVDepot demo request",
        body_text=(
            f"Hi {booking.full_name},\n\n"
            "Thanks for your demo request. Our team replied:\n\n"
            f"{payload.message}\n\n"
            "If you have more questions, reply to this email and we will help you.\n\n"
            "Regards,\nStreamTVDepot Team"
        ),
        metadata={"booking_id": str(booking.id)},
    )
    if not sent:
        raise HTTPException(status_code=502, detail="Failed to send reply email")

    reply = DemoBookingReply(
        booking_id=booking.id,
        author_id=superadmin.id,
        message=payload.message,
        email_sent_at=datetime.now(timezone.utc),
    )
    db.add(reply)

    if booking.status == DemoBookingStatus.UNREAD:
        booking.status = DemoBookingStatus.READ

    await db.commit()
    await db.refresh(reply)
    return reply
