"""
End-user watchlist endpoints.

Routes:
  GET    /auth/user/watchlist          — list the current user's watchlist
  POST   /auth/user/watchlist          — add a video to the watchlist
  DELETE /auth/user/watchlist/{video_id} — remove a video from the watchlist
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_end_user
from app.models.client.user import UserWatchlist
from app.models.client.content import Video

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class WatchlistAddRequest(BaseModel):
    video_id: uuid.UUID


class WatchlistItemOut(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    added_at: datetime
    # Denormalised video info (null if video was deleted)
    title: str | None = None
    thumbnail_url: str | None = None
    duration: int | None = None
    access_type: str | None = None

    model_config = {"from_attributes": True}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[WatchlistItemOut], summary="List current user's watchlist")
async def get_watchlist(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    result = await db.execute(
        select(UserWatchlist)
        .where(
            UserWatchlist.user_id == current_user.id,
            UserWatchlist.client_id == current_user._client_id,
        )
        .order_by(UserWatchlist.added_at.desc())
    )
    items = result.scalars().all()

    # Enrich with video details
    video_ids = [item.video_id for item in items]
    video_map: dict[uuid.UUID, Video] = {}
    if video_ids:
        videos_result = await db.execute(
            select(Video).where(Video.id.in_(video_ids))
        )
        video_map = {v.id: v for v in videos_result.scalars().all()}

    out = []
    for item in items:
        video = video_map.get(item.video_id)
        thumbnail = None
        if video and video.thumbnails:
            thumbnail = (
                video.thumbnails.get("portrait")
                or video.thumbnails.get("landscape")
                or video.thumbnails.get("banner")
            )
        out.append(
            WatchlistItemOut(
                id=item.id,
                video_id=item.video_id,
                added_at=item.added_at,
                title=video.title if video else None,
                thumbnail_url=thumbnail,
                duration=video.duration if video else None,
                access_type=video.access_type if video else None,
            )
        )
    return out


@router.post("", response_model=WatchlistItemOut, status_code=status.HTTP_201_CREATED,
             summary="Add a video to the current user's watchlist")
async def add_to_watchlist(
    payload: WatchlistAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    # Check if already in watchlist
    existing = await db.execute(
        select(UserWatchlist).where(
            UserWatchlist.user_id == current_user.id,
            UserWatchlist.video_id == payload.video_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already in watchlist")

    item = UserWatchlist(
        client_id=current_user._client_id,
        user_id=current_user.id,
        video_id=payload.video_id,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)

    # Enrich with video info
    video_result = await db.execute(select(Video).where(Video.id == payload.video_id))
    video = video_result.scalar_one_or_none()
    thumbnail = None
    if video and video.thumbnails:
        thumbnail = (
            video.thumbnails.get("portrait")
            or video.thumbnails.get("landscape")
            or video.thumbnails.get("banner")
        )

    return WatchlistItemOut(
        id=item.id,
        video_id=item.video_id,
        added_at=item.added_at,
        title=video.title if video else None,
        thumbnail_url=thumbnail,
        duration=video.duration if video else None,
        access_type=video.access_type if video else None,
    )


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remove a video from the current user's watchlist")
async def remove_from_watchlist(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    result = await db.execute(
        select(UserWatchlist).where(
            UserWatchlist.user_id == current_user.id,
            UserWatchlist.video_id == video_id,
            UserWatchlist.client_id == current_user._client_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not in watchlist")
    await db.delete(item)
