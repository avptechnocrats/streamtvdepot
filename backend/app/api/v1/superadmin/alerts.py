"""
Superadmin – Usage Alerts API
GET /superadmin/alerts              → list all usage alerts
GET /superadmin/alerts/{alert_id}   → get single alert
PATCH /superadmin/alerts/{alert_id}/acknowledge → acknowledge alert
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.alert import UsageAlert
from app.models.superadmin.client import Client
from app.schemas.superadmin.alert import AlertAcknowledge, AlertOut

router = APIRouter()


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    client_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),  # active, resolved
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """List all usage alerts."""
    q = (
        select(UsageAlert)
        .options(selectinload(UsageAlert.client))
        .order_by(desc(UsageAlert.created_at))
    )

    if client_id:
        q = q.where(UsageAlert.client_id == client_id)
    if status:
        q = q.where(UsageAlert.status == status)

    q = q.offset((page - 1) * page_size).limit(page_size)
    alerts = (await db.execute(q)).scalars().unique().all()

    return [
        AlertOut(
            id=a.id,
            client_id=a.client_id,
            client_name=a.client.name if a.client else None,
            billing_year=a.billing_year,
            billing_month=a.billing_month,
            metric_type=a.metric_type.value,
            threshold_type=a.threshold_type.value,
            status=a.status.value,
            current_usage=float(a.current_usage),
            plan_limit=float(a.plan_limit) if a.plan_limit else None,
            usage_percentage=float(a.usage_percentage),
            notified_at=a.notified_at,
            acknowledged_at=a.acknowledged_at,
            resolved_at=a.resolved_at,
            created_at=a.created_at,
        )
        for a in alerts
    ]


@router.get("/{alert_id}", response_model=AlertOut)
async def get_alert(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """Get a single alert."""
    alert = (
        await db.execute(
            select(UsageAlert).options(selectinload(UsageAlert.client)).where(UsageAlert.id == alert_id)
        )
    ).scalar_one_or_none()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    return AlertOut(
        id=alert.id,
        client_id=alert.client_id,
        client_name=alert.client.name if alert.client else None,
        billing_year=alert.billing_year,
        billing_month=alert.billing_month,
        metric_type=alert.metric_type.value,
        threshold_type=alert.threshold_type.value,
        status=alert.status.value,
        current_usage=float(alert.current_usage),
        plan_limit=float(alert.plan_limit) if alert.plan_limit else None,
        usage_percentage=float(alert.usage_percentage),
        notified_at=alert.notified_at,
        acknowledged_at=alert.acknowledged_at,
        resolved_at=alert.resolved_at,
        created_at=alert.created_at,
    )


@router.patch("/{alert_id}/acknowledge", status_code=204)
async def acknowledge_alert(
    alert_id: uuid.UUID,
    payload: AlertAcknowledge,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """Acknowledge an alert."""
    alert = await db.execute(select(UsageAlert).where(UsageAlert.id == alert_id)).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    from datetime import datetime, timezone

    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by = payload.acknowledged_by
    alert.status = "acknowledged"
    await db.flush()
