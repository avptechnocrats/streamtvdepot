import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.dependencies import get_current_superadmin
from app.core.scheduler import JOB_EXECUTORS, get_scheduler_snapshot, get_scheduler_summary, trigger_job
from app.models.superadmin.scheduler_job_run import SchedulerJobRun, SchedulerJobStatus

router = APIRouter()


class SchedulerJobOut(BaseModel):
    id: str
    name: str
    schedule: str
    timezone: str
    next_run_at: str | None = None
    last_run_at: str | None = None
    last_status: str
    last_error: str | None = None
    is_running: bool = False
    failure_percentage: float = 0.0


class SchedulerJobSummary(BaseModel):
    total_jobs: int = 0
    running_now: int = 0
    success_today: int = 0
    failed_today: int = 0
    success_week: int = 0
    failed_week: int = 0
    success_month: int = 0
    failed_month: int = 0
    today_failure_rate: float = 0.0
    week_failure_rate: float = 0.0
    month_failure_rate: float = 0.0


class SchedulerJobHistoryItem(BaseModel):
    job_id: str
    job_name: str
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    duration_ms: int | None = None
    error_message: str | None = None


class SchedulerJobListResponse(BaseModel):
    items: list[SchedulerJobOut]
    total: int
    page: int
    page_size: int
    summary: SchedulerJobSummary
    recent_failures: list[SchedulerJobHistoryItem] = []


@router.get("", response_model=SchedulerJobListResponse)
async def list_scheduler_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _=Depends(get_current_superadmin),
):
    """Return the configured scheduler jobs and their current metadata with pagination."""
    jobs = await get_scheduler_snapshot()
    summary = await get_scheduler_summary()
    total = len(jobs)
    start = (page - 1) * page_size
    page_jobs = jobs[start : start + page_size]

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SchedulerJobRun)
            .where(SchedulerJobRun.status == SchedulerJobStatus.FAILED)
            .order_by(SchedulerJobRun.started_at.desc(), SchedulerJobRun.created_at.desc())
            .limit(10)
        )
        recent_failures = result.scalars().all()

    recent_failure_payload = [
        SchedulerJobHistoryItem(
            job_id=row.job_id,
            job_name=row.job_name,
            status=row.status.value if hasattr(row.status, "value") else str(row.status),
            started_at=row.started_at.isoformat() if row.started_at else None,
            finished_at=row.finished_at.isoformat() if row.finished_at else None,
            duration_ms=row.duration_ms,
            error_message=row.error_message,
        )
        for row in recent_failures
    ]

    if not recent_failure_payload:
        recent_failure_payload = [
            SchedulerJobHistoryItem(
                job_id=job["id"],
                job_name=job["name"],
                status="failed",
                started_at=job.get("last_run_at"),
                finished_at=job.get("last_run_at"),
                duration_ms=None,
                error_message=job.get("last_error"),
            )
            for job in jobs
            if job.get("last_status") == "failed"
        ][:10]

    return SchedulerJobListResponse(
        items=[SchedulerJobOut(**job) for job in page_jobs],
        total=total,
        page=page,
        page_size=page_size,
        summary=SchedulerJobSummary(**summary),
        recent_failures=recent_failure_payload,
    )


@router.post("/{job_id}/run", response_model=SchedulerJobOut)
async def run_scheduler_job(
    job_id: str,
    _=Depends(get_current_superadmin),
):
    """Run a scheduler job immediately for manual operational control."""
    if job_id not in JOB_EXECUTORS:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        result = await trigger_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found") from exc

    return SchedulerJobOut(**result)
