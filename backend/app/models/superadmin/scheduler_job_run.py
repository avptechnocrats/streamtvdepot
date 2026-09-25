import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class SchedulerJobStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class SchedulerJobRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "scheduler_job_runs"

    job_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    job_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    status: Mapped[SchedulerJobStatus] = mapped_column(
        Enum(SchedulerJobStatus), default=SchedulerJobStatus.SUCCESS, nullable=False, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)
