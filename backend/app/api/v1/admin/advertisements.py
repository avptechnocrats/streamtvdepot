import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.advertisement import AdEventType, AdPlacement, Advertisement, AdvertisementEvent
from app.schemas.client.advertisement import (
    AdPlacementCreate,
    AdPlacementOut,
    AdvertisementEventCreate,
    AdvertisementListResponse,
    AdvertisementReportOut,
    AdvertisementCreate,
    AdvertisementOut,
    AdvertisementUpdate,
)

router = APIRouter()


@router.get("", response_model=AdvertisementListResponse)
async def list_ads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: str | None = None,
    ad_status: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    query = select(Advertisement).where(Advertisement.client_id == admin._client_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Advertisement.title.ilike(term),
                Advertisement.description.ilike(term),
            )
        )

    if ad_status:
        query = query.where(Advertisement.status == ad_status)

    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0

    status_counts = {
        "all": total,
        "draft": 0,
        "active": 0,
        "paused": 0,
        "expired": 0,
    }

    counts_result = await db.execute(
        select(Advertisement.status, func.count(Advertisement.id))
        .where(Advertisement.client_id == admin._client_id)
        .group_by(Advertisement.status)
    )
    for status_value, count in counts_result.all():
        if status_value is not None:
            status_counts[status_value.value] = int(count)
    status_counts["all"] = total

    items_query = query.order_by(Advertisement.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(items_query)
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "counts": status_counts,
    }


@router.post("", response_model=AdvertisementOut, status_code=status.HTTP_201_CREATED)
async def create_ad(
    payload: AdvertisementCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    ad = Advertisement(client_id=admin._client_id, **payload.model_dump())
    db.add(ad)
    await db.flush()
    await db.refresh(ad)
    return ad


@router.get("/{ad_id}", response_model=AdvertisementOut)
async def get_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id, Advertisement.client_id == admin._client_id
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    return ad


@router.patch("/{ad_id}", response_model=AdvertisementOut)
async def update_ad(
    ad_id: uuid.UUID,
    payload: AdvertisementUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id, Advertisement.client_id == admin._client_id
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ad, field, value)
    await db.flush()
    await db.refresh(ad)
    return ad


@router.delete("/{ad_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ad(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id, Advertisement.client_id == admin._client_id
        )
    )
    ad = result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    await db.delete(ad)


# ─── Placements ───────────────────────────────────────────────────────────────

@router.post("/{ad_id}/placements", response_model=AdPlacementOut, status_code=status.HTTP_201_CREATED)
async def create_placement(
    ad_id: uuid.UUID,
    payload: AdPlacementCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == ad_id, Advertisement.client_id == admin._client_id
        )
    )
    if not ad_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")
    placement = AdPlacement(
        client_id=admin._client_id,
        ad_id=ad_id,
        placement_type=payload.placement_type,
        content_type=payload.content_type,
        content_id=payload.content_id,
        priority=payload.priority,
    )
    db.add(placement)
    await db.flush()
    await db.refresh(placement)
    return placement


@router.get("/{ad_id}/placements", response_model=list[AdPlacementOut])
async def list_placements(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(AdPlacement).where(
            AdPlacement.ad_id == ad_id, AdPlacement.client_id == admin._client_id
        )
    )
    return result.scalars().all()


@router.delete("/{ad_id}/placements/{placement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_placement(
    ad_id: uuid.UUID,
    placement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(AdPlacement).where(
            AdPlacement.id == placement_id,
            AdPlacement.ad_id == ad_id,
            AdPlacement.client_id == admin._client_id,
        )
    )
    placement = result.scalar_one_or_none()
    if not placement:
        raise HTTPException(status_code=404, detail="Placement not found")
    await db.delete(placement)


@router.post("/{ad_id}/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_ad_event(
    ad_id: uuid.UUID,
    payload: AdvertisementEventCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    if payload.advertisement_id != ad_id:
        raise HTTPException(status_code=400, detail="Advertisement ID mismatch")
    ad_result = await db.execute(
        select(Advertisement).where(
            Advertisement.id == payload.advertisement_id,
            Advertisement.client_id == admin._client_id,
        )
    )
    ad = ad_result.scalar_one_or_none()
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")

    billable = 0.0
    if payload.event_type == AdEventType.IMPRESSION and ad.cost_per_impression:
        billable = float(ad.cost_per_impression)
    elif payload.event_type == AdEventType.CLICK and ad.cost_per_click:
        billable = float(ad.cost_per_click)

    inserted_id = await db.scalar(pg_insert(AdvertisementEvent).values(
        client_id=admin._client_id,
        advertisement_id=ad.id,
        event_id=payload.event_id,
        event_type=payload.event_type,
        session_id=payload.session_id,
        content_type=payload.content_type,
        content_id=payload.content_id,
        placement_type=payload.placement_type,
        occurred_at=payload.occurred_at,
        event_metadata=payload.metadata,
        billable_amount=billable,
    ).on_conflict_do_nothing(
        constraint="uq_ad_event_client_event_id",
    ).returning(AdvertisementEvent.id))
    if inserted_id is None:
        return {"accepted": True, "duplicate": True}
    if payload.event_type == AdEventType.IMPRESSION:
        ad.total_impressions = Advertisement.total_impressions + 1
    elif payload.event_type == AdEventType.CLICK:
        ad.total_clicks = Advertisement.total_clicks + 1
    return {"accepted": True, "duplicate": False}


@router.get("/{ad_id}/report", response_model=AdvertisementReportOut)
async def advertisement_report(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    ad_result = await db.execute(
        select(Advertisement).where(Advertisement.id == ad_id, Advertisement.client_id == admin._client_id)
    )
    if not ad_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Advertisement not found")
    rows = await db.execute(
        select(
            AdvertisementEvent.event_type,
            func.count(AdvertisementEvent.id),
            func.coalesce(func.sum(AdvertisementEvent.billable_amount), 0),
        ).where(
            AdvertisementEvent.advertisement_id == ad_id,
            AdvertisementEvent.client_id == admin._client_id,
        ).group_by(AdvertisementEvent.event_type)
    )
    totals = {event_type: (count, revenue) for event_type, count, revenue in rows.all()}
    return AdvertisementReportOut(
        advertisement_id=ad_id,
        impressions=totals.get(AdEventType.IMPRESSION, (0, 0))[0],
        clicks=totals.get(AdEventType.CLICK, (0, 0))[0],
        completions=totals.get(AdEventType.COMPLETE, (0, 0))[0],
        billable_revenue=float(sum(revenue for _, revenue in totals.values())),
    )
