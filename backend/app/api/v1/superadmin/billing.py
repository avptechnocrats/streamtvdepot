import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.billing import BillingStatus, SaasBilling
from app.models.superadmin.client import Client
from app.schemas.superadmin.billing import SaasBillingCreate, SaasBillingOut, SaasBillingUpdate

router = APIRouter()


@router.get("/stats")
async def billing_stats(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """
    Aggregate billing dashboard stats used by the Superadmin Billing section.
    Returns total invoices per status and collected / pending amounts.
    """
    rows = (
        await db.execute(
            select(
                SaasBilling.status,
                func.count(SaasBilling.id).label("count"),
                func.coalesce(func.sum(SaasBilling.total_due), 0).label("total"),
            ).group_by(SaasBilling.status)
        )
    ).all()

    status_map: dict[str, dict] = {}
    for row in rows:
        status_map[row.status] = {"count": row.count, "total": float(row.total)}

    return {
        "total_invoices": sum(v["count"] for v in status_map.values()),
        "pending_amount": status_map.get("pending", {}).get("total", 0.0),
        "paid_amount": status_map.get("paid", {}).get("total", 0.0),
        "failed_count": status_map.get("failed", {}).get("count", 0),
        "refunded_amount": status_map.get("refunded", {}).get("total", 0.0),
        "by_status": status_map,
    }


@router.get("", response_model=list[SaasBillingOut])
async def list_billing(
    client_id: uuid.UUID | None = None,
    billing_status: BillingStatus | None = Query(None, alias="status"),
    period_year: int | None = None,
    period_month: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    q = (
        select(SaasBilling, Client.name, Client.slug)
        .outerjoin(Client, SaasBilling.client_id == Client.id)
    )
    if client_id:
        q = q.where(SaasBilling.client_id == client_id)
    if billing_status:
        q = q.where(SaasBilling.status == billing_status)
    if period_year:
        q = q.where(SaasBilling.period_year == period_year)
    if period_month:
        q = q.where(SaasBilling.period_month == period_month)
    q = q.order_by(SaasBilling.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).all()
    return [
        SaasBillingOut.model_validate(billing).model_copy(
            update={"client_name": c_name, "client_slug": c_slug}
        )
        for billing, c_name, c_slug in rows
    ]


@router.post("", response_model=SaasBillingOut, status_code=status.HTTP_201_CREATED)
async def create_billing_record(
    payload: SaasBillingCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    record = SaasBilling(**payload.model_dump())
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


@router.get("/{billing_id}", response_model=SaasBillingOut)
async def get_billing_record(
    billing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(SaasBilling).where(SaasBilling.id == billing_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Billing record not found")
    return record


@router.patch("/{billing_id}", response_model=SaasBillingOut)
async def update_billing_record(
    billing_id: uuid.UUID,
    payload: SaasBillingUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(SaasBilling).where(SaasBilling.id == billing_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Billing record not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(record, field, value)
    await db.flush()
    await db.refresh(record)
    return record
