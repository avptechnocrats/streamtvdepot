"""
End-user notification endpoints.

GET  /auth/user/notifications              → paginated list (newest first)
GET  /auth/user/notifications/unread-count → badge count
POST /auth/user/notifications/{id}/read    → mark one read
POST /auth/user/notifications/read-all     → mark all read
DELETE /auth/user/notifications/{id}       → dismiss one
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_end_user
from app.models.client.notification import NotificationType, UserNotification

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: uuid.UUID
    type: NotificationType
    title: str
    body: str
    action_url: str | None
    image_url: str | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UnreadCountOut(BaseModel):
    count: int


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated notifications for the authenticated user, newest first."""
    q = (
        select(UserNotification)
        .where(
            UserNotification.client_id == current_user._client_id,
            UserNotification.user_id == current_user.id,
        )
        .order_by(UserNotification.created_at.desc())
    )
    if unread_only:
        q = q.where(UserNotification.is_read.is_(False))

    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.get("/unread-count", response_model=UnreadCountOut)
async def get_unread_count(
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the number of unread notifications (for the badge)."""
    result = await db.execute(
        select(func.count(UserNotification.id)).where(
            UserNotification.client_id == current_user._client_id,
            UserNotification.user_id == current_user.id,
            UserNotification.is_read.is_(False),
        )
    )
    return UnreadCountOut(count=result.scalar_one() or 0)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_one_read(
    notification_id: uuid.UUID,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification as read."""
    result = await db.execute(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.client_id == current_user._client_id,
            UserNotification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.flush()


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read for the authenticated user."""
    await db.execute(
        update(UserNotification)
        .where(
            UserNotification.client_id == current_user._client_id,
            UserNotification.user_id == current_user.id,
            UserNotification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.flush()


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: uuid.UUID,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Dismiss (permanently delete) a single notification."""
    result = await db.execute(
        select(UserNotification).where(
            UserNotification.id == notification_id,
            UserNotification.client_id == current_user._client_id,
            UserNotification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.delete(notif)
    await db.flush()
