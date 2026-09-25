from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.content import Audio, LiveStream, PPVEvent, Series, Video
from app.models.client.payment import Payment, PaymentStatus
from app.models.client.subscription import ClientSubscriptionPlan, SubscriptionStatus, UserSubscription
from app.models.client.user import EndUser
from app.models.client.ticket import SupportTicket, TicketPriority, TicketStatus

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
    buckets: list[dict] = []
    for offset in range(count - 1, -1, -1):
        idx = base_index - offset
        year = idx // 12
        month = (idx % 12) + 1
        buckets.append({
            "year": year,
            "month": month,
            "key": f"{year}-{month:02d}",
            "label": datetime(year, month, 1, tzinfo=timezone.utc).strftime("%b"),
        })
    return buckets


@router.get("")
async def client_admin_dashboard(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    cid = admin._client_id

    total_users = await db.scalar(select(func.count(EndUser.id)).where(EndUser.client_id == cid))
    active_subs = await db.scalar(
        select(func.count(UserSubscription.id)).where(
            UserSubscription.client_id == cid,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
        )
    )
    total_videos = await db.scalar(select(func.count(Video.id)).where(Video.client_id == cid))
    total_audios = await db.scalar(select(func.count(Audio.id)).where(Audio.client_id == cid))
    total_series = await db.scalar(select(func.count(Series.id)).where(Series.client_id == cid))
    live_channels = await db.scalar(
        select(func.count(LiveStream.id)).where(
            LiveStream.client_id == cid, LiveStream.is_active.is_(True)
        )
    )
    total_revenue = await db.scalar(
        select(func.sum(Payment.amount)).where(
            Payment.client_id == cid, Payment.status == PaymentStatus.SUCCESS
        )
    )

    return {
        "total_users": total_users or 0,
        "active_subscriptions": active_subs or 0,
        "content": {
            "videos": total_videos or 0,
            "audios": total_audios or 0,
            "series": total_series or 0,
            "live_channels": live_channels or 0,
        },
        "total_revenue": float(total_revenue or 0),
    }


@router.get("/analytics")
async def client_admin_dashboard_analytics(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    cid = admin._client_id
    buckets = _last_n_months(months)

    plans_total = await db.scalar(
        select(func.count(ClientSubscriptionPlan.id)).where(
            ClientSubscriptionPlan.client_id == cid,
        )
    )
    users_total = await db.scalar(select(func.count(EndUser.id)).where(EndUser.client_id == cid))
    live_tv_total = await db.scalar(
        select(func.count(LiveStream.id)).where(LiveStream.client_id == cid)
    )
    themes_total = 0  # surfaced from frontend registry
    tickets_total = await db.scalar(select(func.count(SupportTicket.id)).where(SupportTicket.client_id == cid))

    user_series = []
    video_series = []
    txn_series = []

    for bucket in buckets:
        start, end = _month_window(bucket["year"], bucket["month"])

        users_count = await db.scalar(
            select(func.count(EndUser.id)).where(
                EndUser.client_id == cid,
                EndUser.created_at >= start,
                EndUser.created_at < end,
            )
        )
        videos_count = await db.scalar(
            select(func.count(Video.id)).where(
                Video.client_id == cid,
                Video.deleted_at.is_(None),
                Video.created_at >= start,
                Video.created_at < end,
            )
        )
        txn_count = await db.scalar(
            select(func.count(Payment.id)).where(
                Payment.client_id == cid,
                Payment.created_at >= start,
                Payment.created_at < end,
                or_(Payment.status == PaymentStatus.SUCCESS, Payment.status == PaymentStatus.PENDING),
            )
        )

        user_series.append({"month": bucket["label"], "value": users_count or 0})
        video_series.append({"month": bucket["label"], "value": videos_count or 0})
        txn_series.append({"month": bucket["label"], "value": txn_count or 0})

    return {
        "months": buckets,
        "widgets": {
            "plans": plans_total or 0,
            "users": users_total or 0,
            "live_tv": live_tv_total or 0,
            "themes": themes_total,
            "tickets": tickets_total or 0,
        },
        "charts": {
            "users": user_series,
            "videos": video_series,
            "transactions": txn_series,
        },
    }


@router.get("/reports")
async def client_admin_reports(
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    cid = admin._client_id
    buckets = _last_n_months(months)
    successful_payments = and_(
        Payment.client_id == cid,
        Payment.status == PaymentStatus.SUCCESS,
    )

    revenue_by_currency_rows = (await db.execute(
        select(Payment.currency, func.sum(Payment.amount).label("amount"))
        .where(successful_payments)
        .group_by(Payment.currency)
        .order_by(Payment.currency)
    )).all()
    payment_status_rows = (await db.execute(
        select(Payment.status, func.count(Payment.id))
        .where(Payment.client_id == cid)
        .group_by(Payment.status)
    )).all()
    subscription_status_rows = (await db.execute(
        select(UserSubscription.status, func.count(UserSubscription.id))
        .where(UserSubscription.client_id == cid)
        .group_by(UserSubscription.status)
    )).all()
    ticket_status_rows = (await db.execute(
        select(SupportTicket.status, func.count(SupportTicket.id))
        .where(SupportTicket.client_id == cid)
        .group_by(SupportTicket.status)
    )).all()

    monthly_revenue = []
    monthly_users = []
    monthly_subscriptions = []
    for bucket in buckets:
        start, end = _month_window(bucket["year"], bucket["month"])
        revenue = await db.scalar(
            select(func.sum(Payment.amount)).where(
                successful_payments,
                Payment.created_at >= start,
                Payment.created_at < end,
            )
        )
        new_users = await db.scalar(
            select(func.count(EndUser.id)).where(
                EndUser.client_id == cid,
                EndUser.created_at >= start,
                EndUser.created_at < end,
            )
        )
        subscriptions_started = await db.scalar(
            select(func.count(UserSubscription.id)).where(
                UserSubscription.client_id == cid,
                UserSubscription.created_at >= start,
                UserSubscription.created_at < end,
            )
        )
        monthly_revenue.append({"month": bucket["label"], "value": float(revenue or 0)})
        monthly_users.append({"month": bucket["label"], "value": new_users or 0})
        monthly_subscriptions.append({"month": bucket["label"], "value": subscriptions_started or 0})

    active_subscriptions = await db.scalar(
        select(func.count(UserSubscription.id)).where(
            UserSubscription.client_id == cid,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
        )
    )
    auto_renewing_subscriptions = await db.scalar(
        select(func.count(UserSubscription.id)).where(
            UserSubscription.client_id == cid,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
            UserSubscription.auto_renew.is_(True),
        )
    )
    open_tickets = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.client_id == cid,
            SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]),
        )
    )
    high_priority_tickets = await db.scalar(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.client_id == cid,
            SupportTicket.priority == TicketPriority.HIGH,
            SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]),
        )
    )

    return {
        "months": buckets,
        "revenue_by_currency": [
            {"currency": currency, "amount": float(amount or 0)}
            for currency, amount in revenue_by_currency_rows
        ],
        "payment_statuses": {status.value: count for status, count in payment_status_rows},
        "subscription_statuses": {status.value: count for status, count in subscription_status_rows},
        "ticket_statuses": {status.value: count for status, count in ticket_status_rows},
        "summary": {
            "total_users": await db.scalar(select(func.count(EndUser.id)).where(EndUser.client_id == cid)) or 0,
            "active_subscriptions": active_subscriptions or 0,
            "auto_renewing_subscriptions": auto_renewing_subscriptions or 0,
            "total_videos": await db.scalar(select(func.count(Video.id)).where(and_(Video.client_id == cid, Video.deleted_at.is_(None)))) or 0,
            "total_audios": await db.scalar(select(func.count(Audio.id)).where(and_(Audio.client_id == cid, Audio.deleted_at.is_(None)))) or 0,
            "total_series": await db.scalar(select(func.count(Series.id)).where(and_(Series.client_id == cid, Series.deleted_at.is_(None)))) or 0,
            "total_live_channels": await db.scalar(select(func.count(LiveStream.id)).where(LiveStream.client_id == cid)) or 0,
            "total_ppv_events": await db.scalar(select(func.count(PPVEvent.id)).where(PPVEvent.client_id == cid)) or 0,
            "open_tickets": open_tickets or 0,
            "high_priority_tickets": high_priority_tickets or 0,
        },
        "charts": {
            "revenue": monthly_revenue,
            "new_users": monthly_users,
            "subscriptions_started": monthly_subscriptions,
        },
    }
