import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.models.client.content import PPVEvent
from app.schemas.client.content import PPVEventCreate, PPVEventOut, PPVEventUpdate

router = APIRouter()


def _build_rtmp_credentials(slug: str) -> dict:
    """Generate a unique RTMP ingest key and its corresponding HLS playback URL."""
    rtmp_key = f"ppv-{slug}-{secrets.token_urlsafe(16)}"
    stream_url = f"{settings.RTMP_HLS_BASE_URL}/{rtmp_key}.m3u8" if settings.RTMP_HLS_BASE_URL else None
    return {"rtmp_key": rtmp_key, "stream_url": stream_url}


@router.get("", response_model=list[PPVEventOut])
async def list_ppv_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(PPVEvent)
        .where(PPVEvent.client_id == admin._client_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(PPVEvent.scheduled_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=PPVEventOut, status_code=status.HTTP_201_CREATED)
async def create_ppv_event(
    payload: PPVEventCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    data = payload.model_dump()
    if payload.source == "rtmp":
        data.update(_build_rtmp_credentials(payload.slug))
    event = PPVEvent(client_id=admin._client_id, **data)
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


@router.get("/{event_id}", response_model=PPVEventOut)
async def get_ppv_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(PPVEvent).where(
            PPVEvent.id == event_id, PPVEvent.client_id == admin._client_id
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="PPV event not found")
    return event


@router.patch("/{event_id}", response_model=PPVEventOut)
async def update_ppv_event(
    event_id: uuid.UUID,
    payload: PPVEventUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(PPVEvent).where(
            PPVEvent.id == event_id, PPVEvent.client_id == admin._client_id
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="PPV event not found")

    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    if updates.get("source") == "rtmp" and (event.source != "rtmp" or not event.rtmp_key):
        updates.update(_build_rtmp_credentials(event.slug or str(event.id)))
    elif updates.get("source") == "external":
        updates["rtmp_key"] = None
    for field, value in updates.items():
        setattr(event, field, value)
    await db.flush()
    await db.refresh(event)
    return event


@router.post("/{event_id}/regenerate-key", response_model=PPVEventOut)
async def regenerate_ppv_rtmp_key(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    """Provision or rotate RTMP credentials for a PPV event."""
    result = await db.execute(
        select(PPVEvent).where(
            PPVEvent.id == event_id, PPVEvent.client_id == admin._client_id
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="PPV event not found")
    if event.source != "rtmp":
        raise HTTPException(status_code=400, detail="PPV event source is not RTMP")

    credentials = _build_rtmp_credentials(event.slug or str(event.id))
    event.rtmp_key = credentials["rtmp_key"]
    event.stream_url = credentials["stream_url"]
    await db.flush()
    await db.refresh(event)
    return event


@router.patch("/{event_id}/toggle-live", response_model=PPVEventOut)
async def toggle_ppv_live(
    event_id: uuid.UUID,
    is_live: bool,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    """Control whether an RTMP PPV event is published as live to entitled viewers."""
    result = await db.execute(
        select(PPVEvent).where(
            PPVEvent.id == event_id, PPVEvent.client_id == admin._client_id
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="PPV event not found")
    if event.source != "rtmp":
        raise HTTPException(status_code=400, detail="Only RTMP PPV events can be toggled live")
    if is_live and not event.rtmp_key:
        raise HTTPException(status_code=400, detail="Generate RTMP credentials before going live")

    event.is_live = is_live
    await db.flush()
    await db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ppv_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(PPVEvent).where(
            PPVEvent.id == event_id, PPVEvent.client_id == admin._client_id
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="PPV event not found")
    await db.delete(event)
