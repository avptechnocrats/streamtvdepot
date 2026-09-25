import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.mail_log import MailDeliveryStatus, SystemMailLog

router = APIRouter()


class MailLogOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID | None
    event_key: str
    recipient_email: str
    recipient_name: str | None
    subject: str
    status: MailDeliveryStatus
    transport: str
    config_source: str
    error_message: str | None
    metadata_json: dict | None
    created_at: str


class MailLogListResponse(BaseModel):
    items: list[MailLogOut]
    total: int
    page: int
    page_size: int
    counts: dict[str, int]


@router.get("", response_model=MailLogListResponse)
async def list_mail_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    status: MailDeliveryStatus | None = Query(None),
    event_key: str | None = Query(None),
    client_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None, description="Search recipient email or subject"),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    query = select(SystemMailLog)

    if status:
        query = query.where(SystemMailLog.status == status)
    if event_key:
        query = query.where(SystemMailLog.event_key == event_key)
    if client_id:
        query = query.where(SystemMailLog.client_id == client_id)
    if search:
        token = f"%{search.strip()}%"
        query = query.where(
            SystemMailLog.recipient_email.ilike(token)
            | SystemMailLog.subject.ilike(token)
        )

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()

    rows_result = await db.execute(
        query.order_by(SystemMailLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = rows_result.scalars().all()

    counts_result = await db.execute(
        select(SystemMailLog.status, func.count()).group_by(SystemMailLog.status)
    )
    counts_map = {k.value if hasattr(k, "value") else str(k): int(v) for k, v in counts_result.all()}
    counts = {
        "all": sum(counts_map.values()),
        "sent": counts_map.get("sent", 0),
        "failed": counts_map.get("failed", 0),
        "skipped": counts_map.get("skipped", 0),
    }

    return MailLogListResponse(
        items=[
            MailLogOut(
                id=row.id,
                client_id=row.client_id,
                event_key=row.event_key,
                recipient_email=row.recipient_email,
                recipient_name=row.recipient_name,
                subject=row.subject,
                status=row.status,
                transport=row.transport,
                config_source=row.config_source,
                error_message=row.error_message,
                metadata_json=row.metadata_json,
                created_at=row.created_at.isoformat() if row.created_at else "",
            )
            for row in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        counts=counts,
    )
