from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.billing import BillingStatus, SaasBilling
from app.models.superadmin.client import Client, ClientStatus
from app.models.superadmin.demo_booking import DemoBookingRequest
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.models.client.ticket import AdminSupportTicket

router = APIRouter()


def _month_window(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _last_n_months(count: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    base_index = now.year * 12 + (now.month - 1)
    out: list[dict] = []

    for offset in range(count - 1, -1, -1):
        idx = base_index - offset
        year = idx // 12
        month = (idx % 12) + 1
        out.append(
            {
                "year": year,
                "month": month,
                "key": f"{year}-{month:02d}",
                "label": datetime(year, month, 1, tzinfo=timezone.utc).strftime("%b"),
            }
        )

    return out


@router.get("")
async def superadmin_dashboard(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    total_clients = await db.scalar(select(func.count(Client.id)))
    active_clients = await db.scalar(
        select(func.count(Client.id)).where(Client.status == ClientStatus.ACTIVE)
    )
    trial_clients = await db.scalar(
        select(func.count(Client.id)).where(Client.status == ClientStatus.TRIAL)
    )
    total_revenue = await db.scalar(
        select(func.sum(SaasBilling.amount)).where(SaasBilling.status == BillingStatus.PAID)
    )
    pending_invoices = await db.scalar(
        select(func.count(SaasBilling.id)).where(SaasBilling.status == BillingStatus.PENDING)
    )

    return {
        "total_clients": total_clients or 0,
        "active_clients": active_clients or 0,
        "trial_clients": trial_clients or 0,
        "total_revenue": float(total_revenue or 0),
        "pending_invoices": pending_invoices or 0,
    }


@router.get("/analytics")
async def superadmin_dashboard_analytics(
    months: int = Query(4, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    month_buckets = _last_n_months(months)

    plans_total = await db.scalar(
        select(func.count(SaasSubscriptionPlan.id)).where(SaasSubscriptionPlan.deleted_at.is_(None))
    )
    clients_total = await db.scalar(select(func.count(Client.id)))
    invoices_total = await db.scalar(select(func.count(SaasBilling.id)))
    demo_bookings_total = await db.scalar(select(func.count(DemoBookingRequest.id)))
    tickets_total = await db.scalar(select(func.count(AdminSupportTicket.id)))

    client_series = []
    demo_series = []
    invoice_series = []

    for m in month_buckets:
        start, end = _month_window(m["year"], m["month"])

        clients_count = await db.scalar(
            select(func.count(Client.id)).where(
                Client.created_at >= start,
                Client.created_at < end,
            )
        )
        demo_count = await db.scalar(
            select(func.count(DemoBookingRequest.id)).where(
                DemoBookingRequest.created_at >= start,
                DemoBookingRequest.created_at < end,
            )
        )
        invoices_count = await db.scalar(
            select(func.count(SaasBilling.id)).where(
                or_(
                    and_(
                        SaasBilling.period_year == m["year"],
                        SaasBilling.period_month == m["month"],
                    ),
                    and_(
                        SaasBilling.period_year.is_(None),
                        SaasBilling.period_month.is_(None),
                        SaasBilling.created_at >= start,
                        SaasBilling.created_at < end,
                    ),
                )
            )
        )

        point = {"month": m["label"]}
        client_series.append({**point, "value": clients_count or 0})
        demo_series.append({**point, "value": demo_count or 0})
        invoice_series.append({**point, "value": invoices_count or 0})

    return {
        "months": month_buckets,
        "widgets": {
            "plans": plans_total or 0,
            "clients": clients_total or 0,
            "invoices": invoices_total or 0,
            "demo_bookings": demo_bookings_total or 0,
            "tickets": tickets_total or 0,
        },
        "charts": {
            "clients": client_series,
            "demo_requests": demo_series,
            "invoices": invoice_series,
        },
    }
