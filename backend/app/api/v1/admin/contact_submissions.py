"""
Client admin contact submissions management.
Routes live under /admin/contact-submissions.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.contact_submission import ContactSubmission, ContactSubmissionStatus
from app.schemas.client.contact_submission import (
    ContactSubmissionDetail,
    ContactSubmissionListCounts,
    ContactSubmissionListResponse,
    ContactSubmissionSummary,
)

router = APIRouter()


@router.get("", response_model=ContactSubmissionListResponse)
async def list_contact_submissions(
    tab: str = Query("all", description="all | unread | read | archived"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    tab_key = (tab or "all").strip().lower()
    if tab_key not in {"all", "unread", "read", "archived"}:
        raise HTTPException(status_code=422, detail="Invalid tab filter")

    status_map = {
        "unread": ContactSubmissionStatus.UNREAD,
        "read": ContactSubmissionStatus.READ,
        "archived": ContactSubmissionStatus.ARCHIVED,
    }

    base = select(ContactSubmission).where(ContactSubmission.client_id == admin._client_id)
    if tab_key in status_map:
        base = base.where(ContactSubmission.status == status_map[tab_key])

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(
        base.order_by(ContactSubmission.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = items_result.scalars().all()

    grouped_result = await db.execute(
        select(ContactSubmission.status, func.count())
        .where(ContactSubmission.client_id == admin._client_id)
        .group_by(ContactSubmission.status)
    )
    grouped = {k.value if hasattr(k, "value") else str(k): v for k, v in grouped_result.all()}
    unread_count = int(grouped.get("unread", 0))
    read_count = int(grouped.get("read", 0))
    archived_count = int(grouped.get("archived", 0))

    return ContactSubmissionListResponse(
        items=[ContactSubmissionSummary.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        counts=ContactSubmissionListCounts(
            all=unread_count + read_count + archived_count,
            unread=unread_count,
            read=read_count,
            archived=archived_count,
        ),
    )


@router.get("/{submission_id}", response_model=ContactSubmissionDetail)
async def get_contact_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(ContactSubmission).where(
            ContactSubmission.id == submission_id,
            ContactSubmission.client_id == admin._client_id,
        )
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Contact submission not found")

    if submission.status == ContactSubmissionStatus.UNREAD:
        submission.status = ContactSubmissionStatus.READ
        await db.commit()
        await db.refresh(submission)

    return submission


@router.patch("/{submission_id}/archive", response_model=ContactSubmissionDetail)
async def archive_contact_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(ContactSubmission).where(
            ContactSubmission.id == submission_id,
            ContactSubmission.client_id == admin._client_id,
        )
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Contact submission not found")

    submission.status = ContactSubmissionStatus.ARCHIVED
    await db.commit()
    await db.refresh(submission)
    return submission