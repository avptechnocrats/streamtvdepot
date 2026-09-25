import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.core.storage import media_display_url
from app.models.client.advertisement import Advertisement as AdvertisementModel
from app.models.client.content import ContentPartner, ContentStatus, Category, Video, video_categories as video_categories_table
from app.schemas.client.content import VideoCreate, VideoOut, VideoThumbnails, VideoUpdate

router = APIRouter()

# Fallback on-screen duration for display ads with no explicit duration_seconds — kept in sync
# with DEFAULT_BANNER_DISPLAY_SECONDS in Client/components/ManagedVideoPlayer.tsx
_DEFAULT_CUE_AD_DURATION_SECONDS = 20


async def _validate_publish(data: dict, video: Video | None = None, *, db: AsyncSession, client_id: uuid.UUID) -> None:
    video_url = data.get("video_url", video.video_url if video else None)
    if not video_url:
        raise HTTPException(status_code=422, detail="A video file is required before publishing")

    advertisement = data.get("advertisement")
    if advertisement is None and video is not None:
        advertisement = video.advertisement or {}
    elif hasattr(advertisement, "model_dump"):
        advertisement = advertisement.model_dump()
    advertisement = advertisement or {}

    if advertisement.get("ad_mode") == "csai" and not any(
        advertisement.get(field) for field in (
            "vmap_tag_url", "vast_tag_url", "pre_ad_id", "post_ad_id", "mid_category_ad_id"
        )
    ):
        raise HTTPException(status_code=422, detail="CSAI mode requires an ad tag or selected campaign")

    duration = data.get("duration", video.duration if video else None)
    for ad_break in advertisement.get("ad_breaks", []):
        if hasattr(ad_break, "model_dump"):
            ad_break = ad_break.model_dump()
        at_seconds = ad_break.get("at_seconds")
        if ad_break.get("position") == "mid" and at_seconds is None:
            raise HTTPException(status_code=422, detail="Mid-roll breaks require a timestamp")
        if duration and at_seconds is not None and at_seconds >= duration:
            raise HTTPException(status_code=422, detail="Mid-roll timestamps must be before the video duration")

    cue_points = [
        (cp.model_dump() if hasattr(cp, "model_dump") else cp)
        for cp in advertisement.get("cue_points", [])
    ]
    if cue_points:
        ad_ids = {cp["advertisement_id"] for cp in cue_points if cp.get("advertisement_id")}
        ads_by_id: dict[str, AdvertisementModel] = {}
        if ad_ids:
            result = await db.execute(
                select(AdvertisementModel).where(
                    AdvertisementModel.client_id == client_id,
                    AdvertisementModel.id.in_([uuid.UUID(a) for a in ad_ids]),
                )
            )
            ads_by_id = {str(ad.id): ad for ad in result.scalars().all()}
        for cp in cue_points:
            ad = ads_by_id.get(cp.get("advertisement_id"))
            at_seconds = cp.get("at_seconds")
            if not ad:
                raise HTTPException(status_code=422, detail="One of the scheduled cue-point ads no longer exists")
            if duration and at_seconds is not None and at_seconds >= duration:
                raise HTTPException(status_code=422, detail=f"Cue-point time for '{ad.title}' must be before the video duration")
            effective_duration = ad.duration_seconds or _DEFAULT_CUE_AD_DURATION_SECONDS
            if duration and effective_duration > duration:
                raise HTTPException(
                    status_code=422,
                    detail=f"'{ad.title}' duration ({effective_duration}s) exceeds the video duration ({duration}s) and cannot be placed on this video",
                )


# ─── Thumbnail URL helpers ────────────────────────────────────────────────────

def _freshen_thumbnail_url(raw: str | None) -> str | None:
    """
    Re-sign a stored thumbnail URL.

    The stored value may be:
    - A plain S3 URL:     https://bucket.s3.region.amazonaws.com/key
    - An old presigned:   https://bucket.s3.region.amazonaws.com/key?X-Amz-Algorithm=...

    In both cases we strip query params, extract the S3 key from the URL path,
    then generate a fresh 7-day presigned GET URL.

    Non-S3 URLs (external/CloudFront) are returned unchanged.
    Falls back to the original URL when presigning fails.
    """
    if not raw:
        return raw

    # Parse and strip query/fragment to get the bare S3 URL
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()

    # Only re-sign URLs that live on AWS S3
    if "amazonaws.com" not in host:
        return raw

    # Virtual-hosted path IS the object key: /folder/uuid.ext  →  folder/uuid.ext
    key = parsed.path.lstrip("/")
    if not key:
        return raw

    fresh = media_display_url(key)
    return fresh if fresh else raw


def _enrich_thumbnails(videos: list[Video]) -> list[VideoOut]:
    """Convert ORM Video rows to VideoOut and replace thumbnail URLs with fresh presigned URLs."""
    schemas: list[VideoOut] = [VideoOut.model_validate(v) for v in videos]
    for s in schemas:
        t = s.thumbnails
        s.thumbnails = VideoThumbnails(
            video_banner=_freshen_thumbnail_url(t.video_banner),
            video_h_thumbnail=_freshen_thumbnail_url(t.video_h_thumbnail),
            video_w_thumbnail=_freshen_thumbnail_url(t.video_w_thumbnail),
        )
    return schemas


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _serialize_nested(payload_dict: dict) -> dict:
    """Convert nested Pydantic models to plain dicts/lists for SQLAlchemy JSONB columns."""
    result = {}
    for k, v in payload_dict.items():
        if hasattr(v, "model_dump"):
            result[k] = v.model_dump()
        elif isinstance(v, list):
            result[k] = [
                item.model_dump() if hasattr(item, "model_dump") else item
                for item in v
            ]
        else:
            result[k] = v
    return result


async def _resolve_partner_id(partner_id: uuid.UUID | None, admin, db: AsyncSession) -> uuid.UUID | None:
    """Partners may only attribute content to themselves; tenant staff can select an active partner."""
    if admin.content_partner_id:
        if partner_id and partner_id != admin.content_partner_id:
            raise HTTPException(status_code=403, detail="Content partners can only manage their own catalog")
        return admin.content_partner_id
    if not partner_id:
        return None
    result = await db.execute(select(ContentPartner).where(
        ContentPartner.id == partner_id,
        ContentPartner.client_id == admin._client_id,
        ContentPartner.status == "active",
    ))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Selected content partner is not active for this tenant")
    return partner_id


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[VideoOut])
async def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    category: str | None = None,
    is_active: bool | None = None,
    is_featured: bool | None = None,
    is_slider: bool | None = None,
    is_thumbnail: bool | None = None,
    access_type: str | None = None,
    publish_option: str | None = None,
    video_status: ContentStatus | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = (
        select(Video)
        .where(Video.client_id == admin._client_id, Video.deleted_at.is_(None))
    )
    if admin.content_partner_id:
        q = q.where(Video.partner_id == admin.content_partner_id)
    if search:
        q = q.where(Video.title.ilike(f"%{search}%"))
    if category:
        q = q.join(Video.categories).where(Category.slug == category)
    if is_active is not None:
        q = q.where(Video.is_active.is_(is_active))
    if is_featured is not None:
        q = q.where(Video.is_featured.is_(is_featured))
    if is_slider is not None:
        q = q.where(Video.is_slider.is_(is_slider))
    if is_thumbnail is not None:
        q = q.where(Video.is_thumbnail.is_(is_thumbnail))
    if access_type is not None:
        q = q.where(Video.access_type == access_type)
    if publish_option is not None:
        q = q.where(Video.publish_option == publish_option)
    if video_status is not None:
        q = q.where(Video.status == video_status)
    q = q.order_by(Video.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    return _enrich_thumbnails(result.scalars().all())


# ─── Trash ────────────────────────────────────────────────────────────────────

@router.get("/trash", response_model=list[VideoOut])
async def list_trash_videos(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = (
        select(Video)
        .where(Video.client_id == admin._client_id, Video.deleted_at.is_not(None))
        .order_by(Video.deleted_at.desc())
    )
    result = await db.execute(q)
    return _enrich_thumbnails(result.scalars().all())


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=VideoOut, status_code=status.HTTP_201_CREATED)
async def create_video(
    payload: VideoCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    if payload.status == ContentStatus.PUBLISHED:
        await _validate_publish(payload.model_dump(), db=db, client_id=admin._client_id)
    # Slug uniqueness per client
    clash = await db.execute(
        select(Video).where(Video.client_id == admin._client_id, Video.slug == payload.slug)
    )
    if clash.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A video with slug '{payload.slug}' already exists",
        )

    # Resolve category slugs → Category ORM objects
    category_slugs = payload.categories or []
    data = _serialize_nested(payload.model_dump(exclude={"categories", "partner_id"}))
    data["partner_id"] = await _resolve_partner_id(payload.partner_id, admin, db)
    video = Video(client_id=admin._client_id, **data)
    db.add(video)
    await db.flush()  # get video.id before resolving relationships

    if category_slugs:
        cats_result = await db.execute(
            select(Category).where(
                Category.client_id == admin._client_id,
                Category.slug.in_(category_slugs),
            )
        )
        cats = list(cats_result.scalars().all())
        if cats:
            await db.execute(
                insert(video_categories_table).values(
                    [{"video_id": video.id, "category_id": c.id} for c in cats]
                ).on_conflict_do_nothing()
            )

    await db.flush()
    await db.refresh(video)
    enriched = _enrich_thumbnails([video])
    return enriched[0]


# ─── Get ──────────────────────────────────────────────────────────────────────

@router.get("/{video_id}", response_model=VideoOut)
async def get_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.client_id == admin._client_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if admin.content_partner_id and video.partner_id != admin.content_partner_id:
        raise HTTPException(status_code=404, detail="Video not found")
    enriched = _enrich_thumbnails([video])
    return enriched[0]


# ─── Update ───────────────────────────────────────────────────────────────────

@router.patch("/{video_id}", response_model=VideoOut)
async def update_video(
    video_id: uuid.UUID,
    payload: VideoUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.client_id == admin._client_id,
            Video.deleted_at.is_(None),
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if admin.content_partner_id and video.partner_id != admin.content_partner_id:
        raise HTTPException(status_code=404, detail="Video not found")

    updates = payload.model_dump(exclude_unset=True)
    if "partner_id" in updates:
        updates["partner_id"] = await _resolve_partner_id(updates["partner_id"], admin, db)

    if updates.get("status") == ContentStatus.PUBLISHED:
        await _validate_publish(updates, video, db=db, client_id=admin._client_id)

    # Extract categories before serializing (it's a relationship, not a JSONB column)
    category_slugs: list[str] | None = updates.pop("categories", None)

    # Slug uniqueness check if changing
    if "slug" in updates and updates["slug"] and updates["slug"] != video.slug:
        clash = await db.execute(
            select(Video).where(
                Video.client_id == admin._client_id,
                Video.slug == updates["slug"],
                Video.id != video_id,
            )
        )
        if clash.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A video with slug '{updates['slug']}' already exists",
            )

    updates = _serialize_nested(updates)
    for field, value in updates.items():
        setattr(video, field, value)

    # Update relationship if categories were included in the patch
    if category_slugs is not None:
        # Explicitly delete existing rows then insert new ones — avoids ORM
        # collection-tracking issues in async context
        await db.execute(
            delete(video_categories_table).where(
                video_categories_table.c.video_id == video.id
            )
        )
        if category_slugs:
            cats_result = await db.execute(
                select(Category).where(
                    Category.client_id == admin._client_id,
                    Category.slug.in_(category_slugs),
                )
            )
            cats = list(cats_result.scalars().all())
            if cats:
                await db.execute(
                    insert(video_categories_table).values(
                        [{"video_id": video.id, "category_id": c.id} for c in cats]
                    ).on_conflict_do_nothing()
                )

    await db.flush()
    await db.refresh(video)
    enriched = _enrich_thumbnails([video])
    return enriched[0]


# ─── Soft delete ──────────────────────────────────────────────────────────────

@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.client_id == admin._client_id,
            Video.deleted_at.is_(None),
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if admin.content_partner_id and video.partner_id != admin.content_partner_id:
        raise HTTPException(status_code=404, detail="Video not found")
    video.deleted_at = datetime.now(tz=timezone.utc)


# ─── Restore ──────────────────────────────────────────────────────────────────

@router.post("/{video_id}/restore", response_model=VideoOut)
async def restore_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.client_id == admin._client_id,
            Video.deleted_at.is_not(None),
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found in trash")
    video.deleted_at = None
    await db.flush()
    await db.refresh(video)
    enriched = _enrich_thumbnails([video])
    return enriched[0]


# ─── Permanent delete ─────────────────────────────────────────────────────────

@router.delete("/{video_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanent_delete_video(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.client_id == admin._client_id,
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    await db.delete(video)
