"""
Client admin contact submissions (storefront Contact Us form).
Routes live under /admin/contact-submissions.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.client_contact_submission import ClientContactSubmission
from app.models.client.contact_submission import ContactSubmissionStatus
from app.schemas.client.client_contact_submission import (
    ClientContactSubmissionCounts,
    ClientContactSubmissionDetail,
    ClientContactSubmissionListResponse,
    ClientContactSubmissionSummary,
)

router = APIRouter()

_STATUS_BY_TAB = {
    "unread": ContactSubmissionStatus.UNREAD,
    "read": ContactSubmissionStatus.READ,
    "archived": ContactSubmissionStatus.ARCHIVED,
}


async def _get_or_404(submission_id: uuid.UUID, client_id: uuid.UUID, db: AsyncSession) -> ClientContactSubmission:
    result = await db.execute(
        select(ClientContactSubmission).where(
            ClientContactSubmission.id == submission_id,
            ClientContactSubmission.client_id == client_id,
        )
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Contact submission not found")
    return submission


@router.get("", response_model=ClientContactSubmissionListResponse)
async def list_contact_submissions(
    tab: str = Query("all", description="all | unread | read | archived"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    tab_key = (tab or "all").strip().lower()
    if tab_key != "all" and tab_key not in _STATUS_BY_TAB:
        raise HTTPException(status_code=422, detail="Invalid tab filter")

    base = select(ClientContactSubmission).where(ClientContactSubmission.client_id == admin._client_id)
    if tab_key in _STATUS_BY_TAB:
        base = base.where(ClientContactSubmission.status == _STATUS_BY_TAB[tab_key])

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items = (await db.execute(
        base.order_by(ClientContactSubmission.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    grouped_result = await db.execute(
        select(ClientContactSubmission.status, func.count())
        .where(ClientContactSubmission.client_id == admin._client_id)
        .group_by(ClientContactSubmission.status)
    )
    grouped = {k.value if hasattr(k, "value") else str(k): v for k, v in grouped_result.all()}
    unread, read, archived = (int(grouped.get(key, 0)) for key in ("unread", "read", "archived"))

    return ClientContactSubmissionListResponse(
        items=[ClientContactSubmissionSummary.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        counts=ClientContactSubmissionCounts(all=unread + read + archived, unread=unread, read=read, archived=archived),
    )


@router.get("/{submission_id}", response_model=ClientContactSubmissionDetail)
async def get_contact_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    submission = await _get_or_404(submission_id, admin._client_id, db)
    if submission.status == ContactSubmissionStatus.UNREAD:
        submission.status = ContactSubmissionStatus.READ
        await db.commit()
        await db.refresh(submission)
    return submission


@router.patch("/{submission_id}/archive", response_model=ClientContactSubmissionDetail)
async def archive_contact_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    submission = await _get_or_404(submission_id, admin._client_id, db)
    submission.status = ContactSubmissionStatus.ARCHIVED
    await db.commit()
    await db.refresh(submission)
    return submission
