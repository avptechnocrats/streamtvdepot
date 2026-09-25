import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.models.client.content import Category, LiveStream, livestream_categories as livestream_categories_table
from app.schemas.client.content import LiveStreamCreate, LiveStreamOut, LiveStreamUpdate

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _build_rtmp_credentials(slug: str) -> dict:
    """Generate a secure stream key and derive the HLS playback URL."""
    token = secrets.token_urlsafe(16)
    rtmp_key = f"{slug}-{token}"
    stream_url = (
        f"{settings.RTMP_HLS_BASE_URL}/{rtmp_key}.m3u8"
        if settings.RTMP_HLS_BASE_URL
        else None
    )
    return {"rtmp_key": rtmp_key, "stream_url": stream_url}


@router.get("", response_model=list[LiveStreamOut])
async def list_streams(
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = select(LiveStream).where(LiveStream.client_id == admin._client_id)
    if search:
        q = q.where(
            or_(
                LiveStream.title.ilike(f"%{search}%"),
                LiveStream.slug.ilike(f"%{search}%"),
            )
        )
    q = q.order_by(LiveStream.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=LiveStreamOut, status_code=status.HTTP_201_CREATED)
async def create_stream(
    payload: LiveStreamCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    category_slugs = payload.categories or []
    data = payload.model_dump(exclude={"categories"})
    # Auto-generate RTMP credentials when source is RTMP
    if payload.source == "rtmp":
        creds = _build_rtmp_credentials(payload.slug)
        data["rtmp_key"] = creds["rtmp_key"]
        data["stream_url"] = creds["stream_url"]  # HLS playback URL
    stream = LiveStream(client_id=admin._client_id, **data)
    db.add(stream)
    await db.flush()
    if category_slugs:
        cats = await db.execute(
            select(Category).where(
                Category.client_id == admin._client_id,
                Category.slug.in_(category_slugs),
            )
        )
        c_list = list(cats.scalars().all())
        if c_list:
            await db.execute(
                insert(livestream_categories_table).values(
                    [{"livestream_id": stream.id, "category_id": c.id} for c in c_list]
                ).on_conflict_do_nothing()
            )
    await db.flush()
    await db.refresh(stream)
    return stream


@router.get("/{stream_id}", response_model=LiveStreamOut)
async def get_stream(
    stream_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")
    return stream


@router.patch("/{stream_id}", response_model=LiveStreamOut)
async def update_stream(
    stream_id: uuid.UUID,
    payload: LiveStreamUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")

    updates = payload.model_dump(exclude_unset=True)
    category_slugs = updates.pop("categories", None)
    for field, value in updates.items():
        setattr(stream, field, value)
    if category_slugs is not None:
        await db.execute(
            delete(livestream_categories_table).where(
                livestream_categories_table.c.livestream_id == stream.id
            )
        )
        if category_slugs:
            cats = await db.execute(
                select(Category).where(
                    Category.client_id == admin._client_id,
                    Category.slug.in_(category_slugs),
                )
            )
            c_list = list(cats.scalars().all())
            if c_list:
                await db.execute(
                    insert(livestream_categories_table).values(
                        [{"livestream_id": stream.id, "category_id": c.id} for c in c_list]
                    ).on_conflict_do_nothing()
                )
    await db.flush()
    await db.refresh(stream)
    return stream


@router.delete("/{stream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stream(
    stream_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")
    await db.delete(stream)


@router.patch("/{stream_id}/toggle-live", response_model=LiveStreamOut)
async def toggle_live(
    stream_id: uuid.UUID,
    is_live: bool,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")

    stream.is_live = is_live
    await db.flush()
    await db.refresh(stream)
    return stream


@router.post("/{stream_id}/regenerate-key", response_model=LiveStreamOut)
async def regenerate_rtmp_key(
    stream_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Generate a fresh RTMP stream key (invalidates the previous key immediately)."""
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")
    if stream.source != "rtmp":
        raise HTTPException(status_code=400, detail="Channel source is not RTMP")

    creds = _build_rtmp_credentials(stream.slug)
    stream.rtmp_key = creds["rtmp_key"]
    stream.stream_url = creds["stream_url"]  # new HLS playback URL
    stream.is_live = False
    stream.stream_status = "idle"
    await db.flush()
    await db.refresh(stream)
    return stream

