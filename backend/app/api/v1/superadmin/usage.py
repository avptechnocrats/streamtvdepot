"""
Superadmin – Client Usage Tracking
GET /superadmin/usage           → list all clients with current-month usage vs. plan limits
GET /superadmin/usage/{id}      → detailed 12-month history for a client
POST /superadmin/usage/record   → upsert usage record (for background jobs / manual entry)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.client.user import ClientAdminUser, EndUser
from app.models.superadmin.client import Client, ClientSubscription
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.models.superadmin.usage import ClientMonthlyUsage
from app.tasks.monthly_usage import collect_monthly_usage
from app.schemas.superadmin.usage import (
    ClientUsageDetail,
    ClientUsageSummary,
    MonthlyUsageRecord,
    UsageSyncRequest,
    UsageSyncResponse,
    UsageUpsert,
)

router = APIRouter()

_ZERO = ClientMonthlyUsage(
    id=uuid.uuid4(),
    client_id=uuid.uuid4(),
    billing_year=0,
    billing_month=0,
)


def _calc_overages(
    usage: ClientMonthlyUsage,
    plan: SaasSubscriptionPlan | None,
) -> dict:
    """Compute overage amounts from raw usage + plan limits."""
    # For persisted monthly snapshots, prefer stored finalized amounts.
    if hasattr(usage, "is_finalized") and getattr(usage, "is_finalized", False):
        return dict(
            overage_storage=float(getattr(usage, "overage_storage", 0) or 0),
            overage_bandwidth=float(getattr(usage, "overage_bandwidth", 0) or 0),
            overage_encoding=float(getattr(usage, "overage_encoding", 0) or 0),
            overage_api=float(getattr(usage, "overage_api", 0) or 0),
            total_overage=float(getattr(usage, "total_overage", 0) or 0),
            base_fee=float(getattr(usage, "base_fee", 0) or 0),
            total_invoice=float(getattr(usage, "total_invoice", 0) or 0),
        )

    ov_storage = ov_bandwidth = ov_encoding = ov_api = 0.0

    if plan:
        rate_bw = float(plan.overage_bandwidth_per_gb or 0)
        rate_st = float(plan.overage_storage_per_gb or 0)
        rate_enc = float(plan.overage_encoding_per_minute or 0)
        rate_api = float(plan.overage_api_per_1m_calls or 0)

        if plan.bandwidth_gb_monthly and rate_bw:
            excess = max(0.0, usage.bandwidth_gb_used - plan.bandwidth_gb_monthly)
            ov_bandwidth = round(excess * rate_bw, 4)

        if plan.max_storage_gb and rate_st:
            excess = max(0.0, usage.storage_gb_used - plan.max_storage_gb)
            ov_storage = round(excess * rate_st, 4)

        if plan.encoding_minutes_monthly and rate_enc:
            excess = max(0.0, usage.encoding_minutes_used - plan.encoding_minutes_monthly)
            ov_encoding = round(excess * rate_enc, 4)

        if plan.api_calls_per_month and rate_api:
            # api_calls_per_month is stored as plain millions count in schema
            limit_calls = plan.api_calls_per_month * 1_000_000
            excess_m = max(0.0, usage.api_calls_used - limit_calls) / 1_000_000
            ov_api = round(excess_m * rate_api, 4)

    total_overage = round(ov_storage + ov_bandwidth + ov_encoding + ov_api, 4)
    base_fee = float(plan.price_monthly) if plan else 0.0
    return dict(
        overage_storage=ov_storage,
        overage_bandwidth=ov_bandwidth,
        overage_encoding=ov_encoding,
        overage_api=ov_api,
        total_overage=total_overage,
        base_fee=base_fee,
        total_invoice=round(base_fee + total_overage, 2),
    )


@router.get("", response_model=list[ClientUsageSummary])
async def list_client_usage(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status: str | None = None,
    billing_year: int | None = None,
    billing_month: int | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    now = datetime.now(timezone.utc)
    year = billing_year or now.year
    month = billing_month or now.month

    # ── Load clients with subscription + plan ─────────────────────────────────
    q = (
        select(Client)
        .outerjoin(ClientSubscription, ClientSubscription.client_id == Client.id)
        .options(
            selectinload(Client.subscription).selectinload(ClientSubscription.plan)
        )
        .where(Client.deleted_at.is_(None) if hasattr(Client, "deleted_at") else True)
        .order_by(Client.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if search:
        q = q.where(Client.name.ilike(f"%{search}%") | Client.email.ilike(f"%{search}%"))
    if status:
        q = q.where(Client.status == status)

    clients = (await db.execute(q)).scalars().unique().all()
    if not clients:
        return []

    client_ids = [c.id for c in clients]

    # ── Load usage records for the requested month ────────────────────────────
    usage_rows = (
        await db.execute(
            select(ClientMonthlyUsage).where(
                ClientMonthlyUsage.client_id.in_(client_ids),
                ClientMonthlyUsage.billing_year == year,
                ClientMonthlyUsage.billing_month == month,
            )
        )
    ).scalars().all()
    usage_map: dict[uuid.UUID, ClientMonthlyUsage] = {r.client_id: r for r in usage_rows}

    # Live user counts for current month view (active users only).
    end_user_counts_rows = (
        await db.execute(
            select(EndUser.client_id, func.count(EndUser.id))
            .where(
                EndUser.client_id.in_(client_ids),
                EndUser.is_active.is_(True),
            )
            .group_by(EndUser.client_id)
        )
    ).all()
    live_end_users = {cid: int(cnt) for cid, cnt in end_user_counts_rows}

    admin_user_counts_rows = (
        await db.execute(
            select(ClientAdminUser.client_id, func.count(ClientAdminUser.id))
            .where(
                ClientAdminUser.client_id.in_(client_ids),
                ClientAdminUser.is_active.is_(True),
            )
            .group_by(ClientAdminUser.client_id)
        )
    ).all()
    live_admin_users = {cid: int(cnt) for cid, cnt in admin_user_counts_rows}

    is_current_period = year == now.year and month == now.month

    results: list[ClientUsageSummary] = []
    for client in clients:
        sub: ClientSubscription | None = client.subscription
        plan: SaasSubscriptionPlan | None = sub.plan if sub and hasattr(sub, "plan") else None

        # Get or fabricate a zero-usage record
        usage = usage_map.get(client.id)
        storage_used = float(usage.storage_gb_used) if usage else 0.0
        bandwidth_used = float(usage.bandwidth_gb_used) if usage else 0.0
        encoding_used = float(usage.encoding_minutes_used) if usage else 0.0
        api_used = int(usage.api_calls_used) if usage else 0
        peak_users = int(usage.concurrent_users_peak) if usage else 0
        snapshot_end_users = int(usage.total_end_users) if usage else 0
        snapshot_admin_users = int(usage.total_admin_users) if usage else 0

        end_users = live_end_users.get(client.id, 0) if is_current_period else snapshot_end_users
        admin_users = live_admin_users.get(client.id, 0) if is_current_period else snapshot_admin_users

        # Fake stub usage object for overage calc
        class _Stub:
            storage_gb_used = storage_used
            bandwidth_gb_used = bandwidth_used
            encoding_minutes_used = encoding_used
            api_calls_used = api_used

        ov = _calc_overages(_Stub(), plan)  # type: ignore[arg-type]

        results.append(
            ClientUsageSummary(
                client_id=client.id,
                client_name=client.name,
                client_slug=client.slug,
                client_logo_url=client.logo_url,
                client_status=client.status.value,
                plan_id=plan.id if plan else None,
                plan_name=plan.name if plan else None,
                plan_currency=plan.currency if plan else "USD",
                plan_price_monthly=float(plan.price_monthly) if plan else None,
                limit_storage_gb=plan.max_storage_gb if plan else None,
                limit_bandwidth_gb=plan.bandwidth_gb_monthly if plan else None,
                limit_encoding_minutes=plan.encoding_minutes_monthly if plan else None,
                limit_users=plan.max_users if plan else None,
                limit_streams=plan.max_streams if plan else None,
                overage_bandwidth_per_gb=float(plan.overage_bandwidth_per_gb) if plan and plan.overage_bandwidth_per_gb else None,
                overage_storage_per_gb=float(plan.overage_storage_per_gb) if plan and plan.overage_storage_per_gb else None,
                overage_encoding_per_minute=float(plan.overage_encoding_per_minute) if plan and plan.overage_encoding_per_minute else None,
                storage_gb_used=storage_used,
                bandwidth_gb_used=bandwidth_used,
                encoding_minutes_used=encoding_used,
                api_calls_used=api_used,
                concurrent_users_peak=peak_users,
                total_videos=int(usage.total_videos) if usage else 0,
                total_audio=int(usage.total_audio) if usage else 0,
                total_live_streams=int(usage.total_live_streams) if usage else 0,
                total_end_users=end_users,
                total_admin_users=admin_users,
                overage_storage=ov["overage_storage"],
                overage_bandwidth=ov["overage_bandwidth"],
                overage_encoding=ov["overage_encoding"],
                overage_api=ov["overage_api"],
                total_overage=ov["total_overage"],
                total_invoice=ov["total_invoice"],
                currency=plan.currency if plan else "USD",
                billing_year=year,
                billing_month=month,
            )
        )
    return results


@router.post("/sync", response_model=UsageSyncResponse)
async def sync_usage_from_aws(
    payload: UsageSyncRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    if payload.billing_month < 1 or payload.billing_month > 12:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="billing_month must be between 1 and 12")

    result = await collect_monthly_usage(db, payload.billing_year, payload.billing_month)
    return UsageSyncResponse(
        status="success",
        message="Usage sync completed",
        billing_year=payload.billing_year,
        billing_month=payload.billing_month,
        attempted_clients=result["attempted_clients"],
        successful_clients=result["successful_clients"],
        failed_clients=result["failed_clients"],
        client_results=result.get("client_results", []),
    )


@router.get("/{client_id}", response_model=ClientUsageDetail)
async def get_client_usage_detail(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    from fastapi import HTTPException

    client = (
        await db.execute(
            select(Client)
            .options(selectinload(Client.subscription).selectinload(ClientSubscription.plan))
            .where(Client.id == client_id)
        )
    ).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    sub: ClientSubscription | None = client.subscription
    plan: SaasSubscriptionPlan | None = sub.plan if sub and hasattr(sub, "plan") else None

    # 12 months of history newest first
    history_rows = (
        await db.execute(
            select(ClientMonthlyUsage)
            .where(ClientMonthlyUsage.client_id == client_id)
            .order_by(
                ClientMonthlyUsage.billing_year.desc(),
                ClientMonthlyUsage.billing_month.desc(),
            )
            .limit(12)
        )
    ).scalars().all()

    monthly_history = []
    for row in history_rows:
        ov = _calc_overages(row, plan)
        monthly_history.append(
            MonthlyUsageRecord(
                billing_year=row.billing_year,
                billing_month=row.billing_month,
                storage_gb_used=float(row.storage_gb_used),
                bandwidth_gb_used=float(row.bandwidth_gb_used),
                encoding_minutes_used=float(row.encoding_minutes_used),
                api_calls_used=int(row.api_calls_used),
                concurrent_users_peak=int(row.concurrent_users_peak),
                total_videos=int(row.total_videos),
                total_audio=int(row.total_audio),
                total_live_streams=int(row.total_live_streams),
                total_end_users=int(row.total_end_users),
                overage_storage=ov["overage_storage"],
                overage_bandwidth=ov["overage_bandwidth"],
                overage_encoding=ov["overage_encoding"],
                overage_api=ov["overage_api"],
                total_overage=ov["total_overage"],
                base_fee=ov["base_fee"],
                total_invoice=ov["total_invoice"],
                is_finalized=row.is_finalized,
                currency=row.currency,
            )
        )

    return ClientUsageDetail(
        client_id=client.id,
        client_name=client.name,
        client_slug=client.slug,
        client_status=client.status.value,
        plan_name=plan.name if plan else None,
        plan_currency=plan.currency if plan else "USD",
        plan_price_monthly=float(plan.price_monthly) if plan else None,
        limit_storage_gb=plan.max_storage_gb if plan else None,
        limit_bandwidth_gb=plan.bandwidth_gb_monthly if plan else None,
        limit_encoding_minutes=plan.encoding_minutes_monthly if plan else None,
        limit_users=plan.max_users if plan else None,
        limit_streams=plan.max_streams if plan else None,
        limit_api_calls=plan.api_calls_per_month if plan else None,
        overage_bandwidth_per_gb=float(plan.overage_bandwidth_per_gb) if plan and plan.overage_bandwidth_per_gb else None,
        overage_storage_per_gb=float(plan.overage_storage_per_gb) if plan and plan.overage_storage_per_gb else None,
        overage_encoding_per_minute=float(plan.overage_encoding_per_minute) if plan and plan.overage_encoding_per_minute else None,
        overage_api_per_1m_calls=float(plan.overage_api_per_1m_calls) if plan and plan.overage_api_per_1m_calls else None,
        monthly_history=monthly_history,
    )


@router.post("/record", status_code=204)
async def upsert_usage_record(
    payload: UsageUpsert,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """Upsert a usage record for a client/month — idempotent."""
    existing = (
        await db.execute(
            select(ClientMonthlyUsage).where(
                ClientMonthlyUsage.client_id == payload.client_id,
                ClientMonthlyUsage.billing_year == payload.billing_year,
                ClientMonthlyUsage.billing_month == payload.billing_month,
            )
        )
    ).scalar_one_or_none()

    if existing:
        for field, val in payload.model_dump(exclude={"client_id", "billing_year", "billing_month"}).items():
            if val is not None:
                setattr(existing, field, val)
    else:
        data = payload.model_dump()
        existing = ClientMonthlyUsage(**{k: v for k, v in data.items() if v is not None})
        db.add(existing)

    await db.flush()
