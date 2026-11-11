"""
End-user watchlist endpoints.

Routes:
  GET    /auth/user/watchlist          — list the current user's watchlist
    POST   /auth/user/watchlist          — add a video or live channel to the watchlist
  DELETE /auth/user/watchlist/{video_id} — remove a video from the watchlist
"""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_end_user
from app.models.client.user import UserWatchlist
from app.models.client.content import ContentStatus, LiveStream, Series, Video
from app.schemas.client.content import _refresh_s3_url

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class WatchlistAddRequest(BaseModel):
    video_id: uuid.UUID
    content_type: Literal["video", "live_stream", "series"] = "video"


class WatchlistItemOut(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    added_at: datetime
    # Denormalised content info (null if content was deleted)
    title: str | None = None
    thumbnail_url: str | None = None
    duration: int | None = None
    access_type: str | None = None
    content_type: Literal["video", "live_stream", "series"] = "video"

    model_config = {"from_attributes": True}


# ─── Endpoints ────────────────────────────────────────────────────────────────

def _watchlist_output(item: UserWatchlist, content: Video | LiveStream | Series | None) -> WatchlistItemOut:
    thumbnails = content.thumbnails if content else {}
    thumbnail = next((thumbnails.get(key) for key in (
        "wide", "portrait", "banner", "video_h_thumbnail", "video_w_thumbnail", "video_banner", "landscape"
    ) if thumbnails.get(key)), None) if thumbnails else None
    if not thumbnail and isinstance(content, Series):
        thumbnail = content.thumbnail_url
    return WatchlistItemOut(
        id=item.id,
        video_id=item.video_id,
        added_at=item.added_at,
        title=content.title if content else None,
        thumbnail_url=_refresh_s3_url(thumbnail) if thumbnail else None,
        duration=content.duration if isinstance(content, Video) else None,
        access_type=content.access_type if content else None,
        content_type="live_stream" if isinstance(content, LiveStream) else "series" if isinstance(content, Series) else "video",
    )


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
            select(Video).where(Video.id.in_(video_ids), Video.client_id == current_user._client_id)
        )
        video_map = {v.id: v for v in videos_result.scalars().all()}

    channel_map: dict[uuid.UUID, LiveStream] = {}
    if video_ids:
        channels_result = await db.execute(
            select(LiveStream).where(LiveStream.id.in_(video_ids), LiveStream.client_id == current_user._client_id)
        )
        channel_map = {channel.id: channel for channel in channels_result.scalars().all()}
    series_map: dict[uuid.UUID, Series] = {}
    if video_ids:
        series_result = await db.execute(
            select(Series).where(Series.id.in_(video_ids), Series.client_id == current_user._client_id)
        )
        series_map = {series.id: series for series in series_result.scalars().all()}
    return [_watchlist_output(item, video_map.get(item.video_id) or channel_map.get(item.video_id) or series_map.get(item.video_id)) for item in items]


@router.post("", response_model=WatchlistItemOut, status_code=status.HTTP_201_CREATED,
             summary="Add a video or live channel to the current user's watchlist")
async def add_to_watchlist(
    payload: WatchlistAddRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_end_user),
):
    content_model = {"live_stream": LiveStream, "series": Series, "video": Video}[payload.content_type]
    filters = [content_model.id == payload.video_id, content_model.client_id == current_user._client_id, content_model.is_active.is_(True)]
    if payload.content_type == "series":
        filters.extend([Series.deleted_at.is_(None), Series.status == ContentStatus.PUBLISHED])
    content_result = await db.execute(
        select(content_model).where(*filters)
    )
    content = content_result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    # Check if already in watchlist
    existing = await db.execute(
        select(UserWatchlist).where(
            UserWatchlist.user_id == current_user.id,
            UserWatchlist.video_id == payload.video_id,
            UserWatchlist.client_id == current_user._client_id,
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

    return _watchlist_output(item, content)


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
