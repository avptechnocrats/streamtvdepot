"""
Scheduled jobs setup using APScheduler.
Runs on application startup.
"""

import asyncio
import logging
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import func, select, update

from app.core.database import AsyncSessionLocal
from app.models.superadmin.scheduler_job_run import SchedulerJobRun, SchedulerJobStatus
from app.tasks.monthly_usage import collect_monthly_usage
from app.tasks.subscription_renewal import (
    pre_renewal_reminders,
    process_grace_periods,
    process_subscription_renewals,
)
from app.tasks.user_subscription_renewal import (
    pre_user_renewal_reminders,
    process_user_subscription_renewals,
)

logger = logging.getLogger(__name__)

JOB_SCHEDULES: dict[str, str] = {
    "monthly_usage_collection": "0 2 1 * * UTC",
    "subscription_renewal": "0 * * * * UTC",
    "pre_renewal_reminders": "0 8 * * * UTC",
    "grace_period_monitoring": "30 0 * * * UTC",
    "user_subscription_renewal": "*/5 * * * * UTC",
    "user_pre_renewal_reminders": "*/15 * * * * UTC",
}

JOB_NAMES: dict[str, str] = {
    "monthly_usage_collection": "Collect monthly AWS usage metrics",
    "subscription_renewal": "Process client subscription renewals and scheduled downgrades",
    "pre_renewal_reminders": "Send T-14, T-7, T-3 day renewal reminder emails",
    "grace_period_monitoring": "Grace period escalation emails and access suspension",
    "user_subscription_renewal": "End-User(viewer): Process subscription renewals (client's own gateway)",
    "user_pre_renewal_reminders": "End-User(viewer): Send T-14, T-7, T-3, T-1 day viewer renewal reminder emails",
}

JOB_EXECUTORS: dict[str, Callable[[], Any]] = {}
JOB_STATUS: dict[str, dict[str, Any]] = {}
RUNNING_JOBS: set[str] = set()
scheduler: AsyncIOScheduler | None = None
MAX_JOB_HISTORY_ITEMS = 30


def calculate_failure_percentage(history: list[dict[str, Any]]) -> float:
    """Return completed-run failure percentage for recent job history."""
    if not history:
        return 0.0

    failed_runs = 0
    for item in history:
        status = item.get("status")
        if hasattr(status, "value"):
            status = status.value
        if str(status or "").lower() == "failed":
            failed_runs += 1

    return round((failed_runs / len(history)) * 100, 2)


async def _persist_job_run(
    job_id: str,
    job_name: str,
    status: SchedulerJobStatus,
    *,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    error_message: str | None = None,
    run_id: Any | None = None,
) -> Any | None:
    """Persist a scheduler run record to the database for auditing and failure reporting."""
    try:
        duration_ms = None
        if started_at and finished_at:
            duration_ms = int((finished_at - started_at).total_seconds() * 1000)

        async with AsyncSessionLocal() as db:
            if run_id is None:
                record = SchedulerJobRun(
                    job_id=job_id,
                    job_name=job_name,
                    status=status,
                    started_at=started_at,
                    finished_at=finished_at,
                    duration_ms=duration_ms,
                    error_message=error_message,
                    metadata_json={
                        "job_id": job_id,
                        "job_name": job_name,
                    },
                )
                db.add(record)
                await db.flush()
                run_id = record.id
            else:
                await db.execute(
                    update(SchedulerJobRun)
                    .where(SchedulerJobRun.id == run_id)
                    .values(
                        status=status,
                        finished_at=finished_at,
                        duration_ms=duration_ms,
                        error_message=error_message,
                    )
                )
            await db.commit()
            return run_id
    except Exception:
        logger.exception("Failed to persist scheduler run record for %s", job_id)
        return None


async def _get_recent_job_history(job_id: str, limit: int = MAX_JOB_HISTORY_ITEMS) -> list[dict[str, Any]]:
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SchedulerJobRun)
                .where(SchedulerJobRun.job_id == job_id)
                .order_by(SchedulerJobRun.created_at.desc())
                .limit(limit)
            )
            rows = result.scalars().all()
            return [
                {
                    "status": row.status.value if hasattr(row.status, "value") else row.status,
                    "started_at": row.started_at.isoformat() if row.started_at else None,
                    "finished_at": row.finished_at.isoformat() if row.finished_at else None,
                    "error_message": row.error_message,
                    "duration_ms": row.duration_ms,
                }
                for row in rows
            ]
    except Exception:
        logger.exception("Failed to load job history for %s", job_id)
        return []


async def _get_latest_job_run(job_id: str) -> SchedulerJobRun | None:
    """Return the latest persisted run for a job, which is the server truth for status reporting."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SchedulerJobRun)
                .where(SchedulerJobRun.job_id == job_id)
                .order_by(SchedulerJobRun.created_at.desc(), SchedulerJobRun.started_at.desc())
                .limit(1)
            )
            return result.scalar_one_or_none()
    except Exception:
        logger.exception("Failed to load latest job record for %s", job_id)
        return None


async def _recover_stale_running_jobs(max_runtime_minutes: int = 30) -> None:
    """Mark abandoned RUNNING rows as failed when they exceed the expected runtime window."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_runtime_minutes)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SchedulerJobRun)
                .where(
                    SchedulerJobRun.status == SchedulerJobStatus.RUNNING,
                    SchedulerJobRun.finished_at.is_(None),
                    SchedulerJobRun.started_at < cutoff,
                )
                .order_by(SchedulerJobRun.started_at.asc())
            )
            stale_rows = result.scalars().all()
            for row in stale_rows:
                row.status = SchedulerJobStatus.FAILED
                row.finished_at = datetime.now(timezone.utc)
                row.duration_ms = int((row.finished_at - row.started_at).total_seconds() * 1000) if row.started_at else None
                row.error_message = (
                    f"Job exceeded maximum runtime of {max_runtime_minutes} minutes and was marked failed by scheduler recovery."
                )
            if stale_rows:
                await db.commit()
                logger.warning("Recovered %s stale running scheduler jobs", len(stale_rows))
    except Exception:
        logger.exception("Failed to recover stale running scheduler jobs")


async def get_scheduler_summary() -> dict[str, Any]:
    """Return aggregate job statistics from the persisted scheduler history for today/week/month."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)

    async with AsyncSessionLocal() as db:
        running_now = await db.scalar(
            select(func.count())
            .select_from(SchedulerJobRun)
            .where(
                SchedulerJobRun.status == SchedulerJobStatus.RUNNING,
                SchedulerJobRun.finished_at.is_(None),
            )
        )

        async def status_counts(start: datetime) -> tuple[int, int]:
            success_count = await db.scalar(
                select(func.count())
                .select_from(SchedulerJobRun)
                .where(
                    SchedulerJobRun.status == SchedulerJobStatus.SUCCESS,
                    SchedulerJobRun.started_at >= start,
                )
            )
            failed_count = await db.scalar(
                select(func.count())
                .select_from(SchedulerJobRun)
                .where(
                    SchedulerJobRun.status == SchedulerJobStatus.FAILED,
                    SchedulerJobRun.started_at >= start,
                )
            )
            return int(success_count or 0), int(failed_count or 0)

        success_today, failed_today = await status_counts(today_start)
        success_week, failed_week = await status_counts(week_start)
        success_month, failed_month = await status_counts(month_start)

    total_jobs = len(JOB_EXECUTORS)
    return {
        "total_jobs": total_jobs,
        "running_now": int(running_now or 0),
        "success_today": success_today,
        "failed_today": failed_today,
        "success_week": success_week,
        "failed_week": failed_week,
        "success_month": success_month,
        "failed_month": failed_month,
        "today_failure_rate": round((failed_today / (success_today + failed_today)) * 100, 1) if (success_today + failed_today) else 0.0,
        "week_failure_rate": round((failed_week / (success_week + failed_week)) * 100, 1) if (success_week + failed_week) else 0.0,
        "month_failure_rate": round((failed_month / (success_month + failed_month)) * 100, 1) if (success_month + failed_month) else 0.0,
    }


def _previous_billing_period() -> tuple[int, int]:
    """Return previous month in UTC as (year, month)."""
    today = datetime.now(timezone.utc)
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


def _job_wrapper(job_id: str, func: Callable[[], Any]) -> Callable[[], Any]:
    async def runner() -> None:
        if job_id in RUNNING_JOBS:
            logger.warning("Skipped start of %s because it is already running", job_id)
            return

        started_at = datetime.now(timezone.utc)
        job_name = JOB_NAMES.get(job_id, job_id)
        JOB_STATUS[job_id] = {
            "last_status": "running",
            "last_run_at": started_at.isoformat(),
            "last_error": None,
            "last_started_at": started_at.isoformat(),
        }
        RUNNING_JOBS.add(job_id)
        run_id = await _persist_job_run(job_id, job_name, SchedulerJobStatus.RUNNING, started_at=started_at)

        try:
            await func()
            finished_at = datetime.now(timezone.utc)
            JOB_STATUS[job_id].update(
                {
                    "last_status": "success",
                    "last_run_at": finished_at.isoformat(),
                    "last_error": None,
                }
            )
            await _persist_job_run(
                job_id,
                job_name,
                SchedulerJobStatus.SUCCESS,
                started_at=started_at,
                finished_at=finished_at,
                run_id=run_id,
            )
            logger.info("Job %s completed successfully", job_id)
        except Exception as exc:  # pragma: no cover - defensive log path
            finished_at = datetime.now(timezone.utc)
            error_text = traceback.format_exc()
            JOB_STATUS[job_id].update(
                {
                    "last_status": "failed",
                    "last_run_at": finished_at.isoformat(),
                    "last_error": str(exc) if str(exc) else error_text,
                }
            )
            await _persist_job_run(
                job_id,
                job_name,
                SchedulerJobStatus.FAILED,
                started_at=started_at,
                finished_at=finished_at,
                error_message=str(exc) if str(exc) else error_text,
                run_id=run_id,
            )
            logger.exception("Job %s failed", job_id)
            raise
        finally:
            RUNNING_JOBS.discard(job_id)

    return runner


async def get_scheduler_snapshot() -> list[dict[str, Any]]:
    if scheduler is None:
        return []

    await _recover_stale_running_jobs()

    jobs: list[dict[str, Any]] = []
    for job in scheduler.get_jobs():
        status = JOB_STATUS.get(job.id, {})
        latest_run = await _get_latest_job_run(job.id)
        history = await _get_recent_job_history(job.id)

        if latest_run is not None:
            last_status = latest_run.status.value if hasattr(latest_run.status, "value") else latest_run.status
            last_run_at = latest_run.started_at.isoformat() if latest_run.started_at else status.get("last_run_at")
            last_error = latest_run.error_message or status.get("last_error")
            is_running = latest_run.status == SchedulerJobStatus.RUNNING and latest_run.finished_at is None
        else:
            last_status = status.get("last_status", "never")
            last_run_at = status.get("last_run_at")
            last_error = status.get("last_error")
            is_running = job.id in RUNNING_JOBS

        jobs.append(
            {
                "id": job.id,
                "name": job.name or JOB_NAMES.get(job.id, job.id),
                "schedule": JOB_SCHEDULES.get(job.id, str(job.trigger)),
                "timezone": "UTC",
                "next_run_at": job.next_run_time.isoformat() if job.next_run_time else None,
                "last_run_at": last_run_at,
                "last_status": last_status,
                "last_error": last_error,
                "is_running": is_running,
                "failure_percentage": calculate_failure_percentage(history),
            }
        )
    return jobs


async def trigger_job(job_id: str) -> dict[str, Any]:
    if job_id not in JOB_EXECUTORS:
        raise KeyError(f"Unknown job id: {job_id}")

    await JOB_EXECUTORS[job_id]()
    status = JOB_STATUS.get(job_id, {})
    history = await _get_recent_job_history(job_id)
    return {
        "id": job_id,
        "name": JOB_NAMES.get(job_id, job_id),
        "schedule": JOB_SCHEDULES.get(job_id, "manual"),
        "timezone": "UTC",
        "next_run_at": None,
        "last_run_at": status.get("last_run_at"),
        "last_status": status.get("last_status", "never"),
        "last_error": status.get("last_error"),
        "is_running": job_id in RUNNING_JOBS,
        "failure_percentage": calculate_failure_percentage(history),
    }


def schedule_jobs() -> AsyncIOScheduler:
    """Initialize and start background scheduler."""
    global scheduler
    scheduler = AsyncIOScheduler(timezone="UTC")

    JOB_EXECUTORS["monthly_usage_collection"] = _job_wrapper("monthly_usage_collection", _monthly_usage_collection_job)
    JOB_EXECUTORS["subscription_renewal"] = _job_wrapper("subscription_renewal", _subscription_renewal_job)
    JOB_EXECUTORS["pre_renewal_reminders"] = _job_wrapper("pre_renewal_reminders", _pre_renewal_reminders_job)
    JOB_EXECUTORS["grace_period_monitoring"] = _job_wrapper("grace_period_monitoring", _grace_period_monitoring_job)
    JOB_EXECUTORS["user_subscription_renewal"] = _job_wrapper("user_subscription_renewal", _user_subscription_renewal_job)
    JOB_EXECUTORS["user_pre_renewal_reminders"] = _job_wrapper("user_pre_renewal_reminders", _user_pre_renewal_reminders_job)

    scheduler.add_job(
        func=_job_wrapper("monthly_usage_collection", _monthly_usage_collection_job),
        trigger=CronTrigger(day=1, hour=2, minute=0, timezone="UTC"),
        id="monthly_usage_collection",
        name="Collect monthly AWS usage metrics",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )

    scheduler.add_job(
        func=_job_wrapper("subscription_renewal", _subscription_renewal_job),
        trigger=CronTrigger(minute=0, timezone="UTC"),
        id="subscription_renewal",
        name="Process subscription renewals and scheduled downgrades",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )

    scheduler.add_job(
        func=_job_wrapper("pre_renewal_reminders", _pre_renewal_reminders_job),
        trigger=CronTrigger(hour=8, minute=0, timezone="UTC"),
        id="pre_renewal_reminders",
        name="Send T-14, T-7, T-3 day renewal reminder emails",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )

    scheduler.add_job(
        func=_job_wrapper("grace_period_monitoring", _grace_period_monitoring_job),
        trigger=CronTrigger(hour=0, minute=30, timezone="UTC"),
        id="grace_period_monitoring",
        name="Grace-period escalation emails and access suspension",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )

    scheduler.add_job(
        func=_job_wrapper("user_subscription_renewal", _user_subscription_renewal_job),
        trigger=CronTrigger(minute="*/5", timezone="UTC"),
        id="user_subscription_renewal",
        name="End-User(viewer): Process subscription renewals (client's own gateway)",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )

    scheduler.add_job(
        func=_job_wrapper("user_pre_renewal_reminders", _user_pre_renewal_reminders_job),
        trigger=CronTrigger(minute="*/15", timezone="UTC"),
        id="user_pre_renewal_reminders",
        name="End-User(viewer): Send T-14, T-7, T-3, T-1 day renewal reminder emails",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduled jobs initialized")
    return scheduler


async def _monthly_usage_collection_job() -> None:
    """Run monthly usage collection for previous billing period."""
    billing_year, billing_month = _previous_billing_period()

    logger.info(f"Starting monthly usage collection for {billing_year}-{billing_month:02d}")

    try:
        async with AsyncSessionLocal() as db:
            await collect_monthly_usage(db, billing_year, billing_month)
        logger.info(f"Monthly usage collection completed for {billing_year}-{billing_month:02d}")
    except Exception as e:
        logger.error(f"Failed to collect monthly usage: {e}", exc_info=True)


async def _subscription_renewal_job() -> None:
    """Process subscription renewals, apply scheduled downgrades, and send renewal emails."""
    logger.info("Starting subscription renewal job")
    async with AsyncSessionLocal() as db:
        await process_subscription_renewals(db)
    logger.info("Subscription renewal job completed")


async def _pre_renewal_reminders_job() -> None:
    """Send upcoming-renewal reminder emails (T-14, T-7, T-3)."""
    logger.info("Starting pre-renewal reminders job")
    try:
        async with AsyncSessionLocal() as db:
            await pre_renewal_reminders(db)
        logger.info("Pre-renewal reminders job completed")
    except Exception as e:
        logger.error(f"Pre-renewal reminders job failed: {e}", exc_info=True)


async def _grace_period_monitoring_job() -> None:
    """Send grace-period escalation emails and suspend expired accounts."""
    logger.info("Starting grace-period monitoring job")
    try:
        async with AsyncSessionLocal() as db:
            await process_grace_periods(db)
        logger.info("Grace-period monitoring job completed")
    except Exception as e:
        logger.error(f"Grace-period monitoring job failed: {e}", exc_info=True)


async def _user_subscription_renewal_job() -> None:
    """Process end-user subscription renewals via their client's own Stripe/PayPal."""
    logger.info("Starting end-user subscription renewal job")
    try:
        async with AsyncSessionLocal() as db:
            await process_user_subscription_renewals(db)
        logger.info("End-user subscription renewal job completed")
    except Exception as e:
        logger.error(f"End-user subscription renewal job failed: {e}", exc_info=True)


async def _user_pre_renewal_reminders_job() -> None:
    """Send upcoming-renewal reminder emails to end users."""
    logger.info("Starting end-user pre-renewal reminders job")
    try:
        async with AsyncSessionLocal() as db:
            await pre_user_renewal_reminders(db)
        logger.info("End-user pre-renewal reminders job completed")
    except Exception as e:
        logger.error(f"End-user pre-renewal reminders job failed: {e}", exc_info=True)
