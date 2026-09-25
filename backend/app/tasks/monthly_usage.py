"""
Celery task for monthly usage collection and alert triggering.
Runs on the 1st of each month (cron job).
"""

import logging
from calendar import monthrange
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import app.models.superadmin.module  # noqa: F401  # Register Module mapper for relationship resolution

from app.core.aws_metrics import AWSMetricsCollector
from app.core.config import settings
from app.models.client.content import Video
from app.models.client.user import ClientAdminUser, EndUser
from app.models.superadmin.alert import AlertMetricType, AlertThresholdType, UsageAlert
from app.models.superadmin.billing import BillingStatus, SaasBilling
from app.models.superadmin.client import Client, ClientSubscription
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.models.superadmin.usage import ClientMonthlyUsage

logger = logging.getLogger(__name__)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).date()
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return None


def _month_window(year: int, month: int) -> tuple[date, date, int]:
    end_day = monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, end_day)
    return start, end, end_day


def _proration(sub: ClientSubscription | None, year: int, month: int) -> tuple[float, date, date, int, int]:
    """Return (factor, active_start, active_end, active_days, days_in_month)."""
    month_start, month_end, days_in_month = _month_window(year, month)

    if not sub:
        return 0.0, month_start, month_end, 0, days_in_month

    started = _parse_date(sub.started_at)
    expires = _parse_date(sub.expires_at)

    active_start = max(month_start, started) if started else month_start
    active_end = min(month_end, expires) if expires else month_end

    if active_end < active_start:
        return 0.0, active_start, active_end, 0, days_in_month

    active_days = (active_end - active_start).days + 1
    factor = round(active_days / days_in_month, 6)
    return factor, active_start, active_end, active_days, days_in_month


async def _upsert_invoice(
    db: AsyncSession,
    *,
    client: Client,
    usage: ClientMonthlyUsage,
    plan: SaasSubscriptionPlan | None,
    billing_year: int,
    billing_month: int,
    period_start: date,
    period_end: date,
    amount: float,
    currency: str,
    proration_factor: float,
    active_days: int,
    days_in_month: int,
    subtotal: float,
    overage_total: float,
    discount_amount: float,
    tax_amount: float,
    total_due: float,
    plan_snapshot: dict,
    usage_snapshot: dict,
) -> None:
    invoice_number = f"SV-{billing_year}{billing_month:02d}-{client.slug.upper().replace('-', '')}"

    existing = (
        await db.execute(select(SaasBilling).where(SaasBilling.invoice_number == invoice_number))
    ).scalar_one_or_none()

    notes = f"Auto-generated from usage snapshot. Proration: {active_days}/{days_in_month} ({proration_factor:.4f})."

    if existing:
        existing.client_id = client.id
        existing.plan_id = plan.id if plan else None
        existing.amount = amount
        existing.currency = currency
        existing.billing_period_start = period_start.isoformat()
        existing.billing_period_end = period_end.isoformat()
        existing.period_year = billing_year
        existing.period_month = billing_month
        existing.usage_record_id = usage.id
        existing.plan_snapshot = plan_snapshot
        existing.usage_snapshot = usage_snapshot
        existing.subtotal = subtotal
        existing.overage_total = overage_total
        existing.discount_amount = discount_amount
        existing.tax_amount = tax_amount
        existing.total_due = total_due
        existing.proration_factor = proration_factor
        existing.active_days = active_days
        existing.billing_days = days_in_month
        existing.finalized_at = datetime.utcnow().isoformat()
        existing.notes = notes
    else:
        db.add(
            SaasBilling(
                client_id=client.id,
                plan_id=plan.id if plan else None,
                invoice_number=invoice_number,
                amount=amount,
                currency=currency,
                status=BillingStatus.PENDING,
                billing_period_start=period_start.isoformat(),
                billing_period_end=period_end.isoformat(),
                period_year=billing_year,
                period_month=billing_month,
                usage_record_id=usage.id,
                plan_snapshot=plan_snapshot,
                usage_snapshot=usage_snapshot,
                subtotal=subtotal,
                overage_total=overage_total,
                discount_amount=discount_amount,
                tax_amount=tax_amount,
                total_due=total_due,
                proration_factor=proration_factor,
                active_days=active_days,
                billing_days=days_in_month,
                finalized_at=datetime.utcnow().isoformat(),
                notes=notes,
            )
        )


async def collect_monthly_usage(db: AsyncSession, billing_year: int, billing_month: int) -> dict[str, Any]:
    """
    Collect usage metrics from AWS for all clients.
    Called once per month (cron job).
    """
    # AWS metrics collector
    collector = AWSMetricsCollector(
        aws_access_key=settings.AWS_ACCESS_KEY_ID,
        aws_secret_key=settings.AWS_SECRET_ACCESS_KEY,
        aws_region=settings.AWS_REGION,
    )

    # Get all active clients
    clients = (
        await db.execute(
            select(Client)
            .options(
                selectinload(Client.subscription).selectinload(ClientSubscription.plan)
            )
            .where(Client.is_active.is_(True))
        )
    ).scalars().unique().all()

    attempted_clients = 0
    successful_clients = 0
    failed_clients = 0
    client_results: list[dict[str, Any]] = []

    for client in clients:
        attempted_clients += 1
        try:
            logger.info(f"Collecting usage for client={client.slug} {billing_year}-{billing_month:02d}")

            # Collect metrics from AWS
            bandwidth_gb = collector.get_bandwidth_gb(client.slug, billing_year, billing_month)
            storage_gb = collector.get_storage_gb(client.slug, settings.AWS_S3_BUCKET)
            encoding_minutes = collector.get_encoding_minutes(client.slug, billing_year, billing_month)
            concurrent_peak = collector.get_concurrent_peak(client.slug, billing_year, billing_month)
            api_used = 0
            diagnostics = collector.get_client_diagnostics(client.slug)

            # Count content
            total_videos = (
                await db.scalar(
                    select(func.count(Video.id)).where(Video.client_id == client.id)
                )
            ) or 0

            total_end_users = (
                await db.scalar(
                    select(func.count(EndUser.id)).where(
                        EndUser.client_id == client.id,
                        EndUser.is_active.is_(True),
                    )
                )
            ) or 0

            total_admin_users = (
                await db.scalar(
                    select(func.count(ClientAdminUser.id)).where(
                        ClientAdminUser.client_id == client.id,
                        ClientAdminUser.is_active.is_(True),
                    )
                )
            ) or 0

            # Get subscription plan
            sub = client.subscription
            plan: SaasSubscriptionPlan | None = sub.plan if sub else None

            # Billing proration for the month based on subscription active dates.
            proration_factor, period_start, period_end, active_days, days_in_month = _proration(
                sub,
                billing_year,
                billing_month,
            )

            # Compute overages
            ov_bw = ov_st = ov_enc = ov_api = 0.0
            if plan:
                # Industry standard: prorate monthly limits for partial active months.
                eff_bw_limit = (
                    float(plan.bandwidth_gb_monthly) * proration_factor
                    if plan.bandwidth_gb_monthly is not None
                    else None
                )
                eff_storage_limit = (
                    float(plan.max_storage_gb) * proration_factor
                    if plan.max_storage_gb is not None
                    else None
                )
                eff_encoding_limit = (
                    float(plan.encoding_minutes_monthly) * proration_factor
                    if plan.encoding_minutes_monthly is not None
                    else None
                )
                eff_api_limit = (
                    float(plan.api_calls_per_month) * proration_factor
                    if plan.api_calls_per_month is not None
                    else None
                )

                if plan.bandwidth_gb_monthly and plan.overage_bandwidth_per_gb:
                    limit = eff_bw_limit if eff_bw_limit is not None else float(plan.bandwidth_gb_monthly)
                    excess = max(0.0, bandwidth_gb - limit)
                    ov_bw = round(excess * float(plan.overage_bandwidth_per_gb), 4)

                if plan.max_storage_gb and plan.overage_storage_per_gb:
                    limit = eff_storage_limit if eff_storage_limit is not None else float(plan.max_storage_gb)
                    excess = max(0.0, storage_gb - limit)
                    ov_st = round(excess * float(plan.overage_storage_per_gb), 4)

                if plan.encoding_minutes_monthly and plan.overage_encoding_per_minute:
                    limit = eff_encoding_limit if eff_encoding_limit is not None else float(plan.encoding_minutes_monthly)
                    excess = max(0.0, encoding_minutes - limit)
                    ov_enc = round(excess * float(plan.overage_encoding_per_minute), 4)

                if plan.api_calls_per_month and plan.overage_api_per_1m_calls:
                    limit_m = eff_api_limit if eff_api_limit is not None else float(plan.api_calls_per_month)
                    limit_calls = int(limit_m * 1_000_000)
                    excess_m = max(0, api_used - limit_calls) / 1_000_000
                    ov_api = round(excess_m * float(plan.overage_api_per_1m_calls), 4)

            total_overage = round(ov_bw + ov_st + ov_enc + ov_api, 4)
            base_fee = round((float(plan.price_monthly) if plan else 0.0) * proration_factor, 2)
            total_invoice = round(base_fee + total_overage, 2)
            subtotal = base_fee
            overage_total = round(total_overage, 2)
            discount_amount = 0.0
            tax_amount = 0.0
            total_due = round(subtotal + overage_total - discount_amount + tax_amount, 2)

            # Upsert usage record
            existing = (
                await db.execute(
                    select(ClientMonthlyUsage).where(
                        ClientMonthlyUsage.client_id == client.id,
                        ClientMonthlyUsage.billing_year == billing_year,
                        ClientMonthlyUsage.billing_month == billing_month,
                    )
                )
            ).scalar_one_or_none()

            if existing:
                existing.bandwidth_gb_used = bandwidth_gb
                existing.storage_gb_used = storage_gb
                existing.encoding_minutes_used = encoding_minutes
                existing.concurrent_users_peak = concurrent_peak
                existing.total_videos = total_videos
                existing.total_end_users = int(total_end_users)
                existing.total_admin_users = int(total_admin_users)
                existing.api_calls_used = int(api_used)
                existing.overage_bandwidth = ov_bw
                existing.overage_storage = ov_st
                existing.overage_encoding = ov_enc
                existing.overage_api = ov_api
                existing.total_overage = total_overage
                existing.base_fee = base_fee
                existing.total_invoice = total_invoice
                existing.is_finalized = True
                existing.currency = plan.currency if plan else "USD"
            else:
                usage_record = ClientMonthlyUsage(
                    client_id=client.id,
                    billing_year=billing_year,
                    billing_month=billing_month,
                    bandwidth_gb_used=bandwidth_gb,
                    storage_gb_used=storage_gb,
                    encoding_minutes_used=encoding_minutes,
                    concurrent_users_peak=concurrent_peak,
                    total_videos=total_videos,
                    total_end_users=int(total_end_users),
                    total_admin_users=int(total_admin_users),
                    api_calls_used=int(api_used),
                    overage_bandwidth=ov_bw,
                    overage_storage=ov_st,
                    overage_encoding=ov_enc,
                    overage_api=ov_api,
                    total_overage=total_overage,
                    base_fee=base_fee,
                    total_invoice=total_invoice,
                    is_finalized=True,
                    currency=plan.currency if plan else "USD",
                )
                db.add(usage_record)

            await db.flush()

            plan_snapshot = {
                "plan_id": str(plan.id) if plan else None,
                "plan_name": plan.name if plan else None,
                "currency": plan.currency if plan else "USD",
                "price_monthly": float(plan.price_monthly) if plan else 0.0,
                "limits": {
                    "storage_gb": float(plan.max_storage_gb) if plan and plan.max_storage_gb is not None else None,
                    "bandwidth_gb": float(plan.bandwidth_gb_monthly) if plan and plan.bandwidth_gb_monthly is not None else None,
                    "encoding_minutes": float(plan.encoding_minutes_monthly) if plan and plan.encoding_minutes_monthly is not None else None,
                    "api_calls_million": float(plan.api_calls_per_month) if plan and plan.api_calls_per_month is not None else None,
                },
                "overage_rates": {
                    "storage_per_gb": float(plan.overage_storage_per_gb) if plan and plan.overage_storage_per_gb is not None else 0.0,
                    "bandwidth_per_gb": float(plan.overage_bandwidth_per_gb) if plan and plan.overage_bandwidth_per_gb is not None else 0.0,
                    "encoding_per_minute": float(plan.overage_encoding_per_minute) if plan and plan.overage_encoding_per_minute is not None else 0.0,
                    "api_per_1m_calls": float(plan.overage_api_per_1m_calls) if plan and plan.overage_api_per_1m_calls is not None else 0.0,
                },
            }

            usage_snapshot = {
                "storage_gb_used": float(storage_gb),
                "bandwidth_gb_used": float(bandwidth_gb),
                "encoding_minutes_used": float(encoding_minutes),
                "api_calls_used": int(api_used),
                "concurrent_users_peak": int(concurrent_peak),
                "total_videos": int(total_videos),
                "total_end_users": int(total_end_users),
                "total_admin_users": int(total_admin_users),
                "overages": {
                    "storage": ov_st,
                    "bandwidth": ov_bw,
                    "encoding": ov_enc,
                    "api": ov_api,
                    "total": total_overage,
                },
            }

            await _upsert_invoice(
                db,
                client=client,
                usage=existing or usage_record,
                plan=plan,
                billing_year=billing_year,
                billing_month=billing_month,
                period_start=period_start,
                period_end=period_end,
                amount=total_due,
                currency=plan.currency if plan else "USD",
                proration_factor=proration_factor,
                active_days=active_days,
                days_in_month=days_in_month,
                subtotal=subtotal,
                overage_total=overage_total,
                discount_amount=discount_amount,
                tax_amount=tax_amount,
                total_due=total_due,
                plan_snapshot=plan_snapshot,
                usage_snapshot=usage_snapshot,
            )

            # Trigger alerts if needed
            await trigger_usage_alerts(db, client, plan, existing or usage_record)

            await db.flush()

            successful_clients += 1
            client_results.append(
                {
                    "client_id": str(client.id),
                    "client_slug": client.slug,
                    "success": True,
                    "metrics": {
                        "bandwidth_gb_used": float(bandwidth_gb),
                        "storage_gb_used": float(storage_gb),
                        "encoding_minutes_used": float(encoding_minutes),
                        "concurrent_users_peak": int(concurrent_peak),
                    },
                    "diagnostics": diagnostics,
                }
            )

        except Exception as e:
            logger.error(f"Failed to collect usage for {client.slug}: {e}", exc_info=True)
            failed_clients += 1
            client_results.append(
                {
                    "client_id": str(client.id),
                    "client_slug": client.slug,
                    "success": False,
                    "metrics": None,
                    "diagnostics": {"collector": str(e)},
                }
            )
            continue

    await db.commit()
    logger.info(f"Monthly usage collection completed for {billing_year}-{billing_month:02d}")
    return {
        "attempted_clients": attempted_clients,
        "successful_clients": successful_clients,
        "failed_clients": failed_clients,
        "client_results": client_results,
    }


async def trigger_usage_alerts(
    db: AsyncSession,
    client: Client,
    plan: SaasSubscriptionPlan | None,
    usage: ClientMonthlyUsage,
):
    """
    Check usage against plan limits and fire alerts.
    Thresholds: 80% (at_risk), 100% (over_limit), 110% (critical).
    """
    if not plan:
        return

    checks = [
        ("bandwidth", usage.bandwidth_gb_used, plan.bandwidth_gb_monthly, AlertMetricType.BANDWIDTH),
        ("storage", usage.storage_gb_used, plan.max_storage_gb, AlertMetricType.STORAGE),
        ("encoding", usage.encoding_minutes_used, plan.encoding_minutes_monthly, AlertMetricType.ENCODING),
    ]

    for name, current, limit, metric_type in checks:
        if not limit or limit <= 0:
            continue  # Skip unlimited metrics

        pct = (current / limit) * 100

        # Determine threshold
        if pct >= 110:
            threshold = AlertThresholdType.CRITICAL
        elif pct >= 100:
            threshold = AlertThresholdType.OVER_LIMIT
        elif pct >= 80:
            threshold = AlertThresholdType.AT_RISK
        else:
            continue  # No alert needed

        # Check if alert already exists
        existing_alert = (
            await db.execute(
                select(UsageAlert).where(
                    UsageAlert.client_id == client.id,
                    UsageAlert.billing_year == usage.billing_year,
                    UsageAlert.billing_month == usage.billing_month,
                    UsageAlert.metric_type == metric_type,
                    UsageAlert.threshold_type == threshold,
                )
            )
        ).scalar_one_or_none()

        if not existing_alert:
            alert = UsageAlert(
                client_id=client.id,
                billing_year=usage.billing_year,
                billing_month=usage.billing_month,
                metric_type=metric_type,
                threshold_type=threshold,
                current_usage=current,
                plan_limit=limit,
                usage_percentage=round(pct, 2),
            )
            db.add(alert)
            logger.info(
                f"Alert created: client={client.slug} metric={metric_type} threshold={threshold} usage={pct:.1f}%"
            )

    await db.flush()
