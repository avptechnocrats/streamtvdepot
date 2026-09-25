"""
SuperAdmin contact submissions management — all contact submissions (main-site + client-specific).
Routes live under /superadmin/contact-submissions.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.client.contact_submission import ContactSubmission, ContactSubmissionStatus
from app.models.superadmin.client import Client

router = APIRouter()


class ContactSubmissionSummaryWithClient:
    """Extended summary that includes client info"""
    def __init__(self, submission: ContactSubmission, client: Client | None = None):
        self.id = submission.id
        self.client_id = submission.client_id
        self.client_name = client.name if client else "[Main Site Inquiry]"
        self.client_slug = client.slug if client else None
        self.full_name = submission.full_name
        self.work_email = submission.work_email
        self.company = submission.company
        self.phone = submission.phone
        self.subject = submission.subject
        self.message = submission.message
        self.status = submission.status
        self.created_at = submission.created_at
        self.updated_at = submission.updated_at

    def model_dump(self):
        return {
            "id": str(self.id),
            "client_id": str(self.client_id) if self.client_id else None,
            "client_name": self.client_name,
            "client_slug": self.client_slug,
            "full_name": self.full_name,
            "work_email": self.work_email,
            "company": self.company,
            "phone": self.phone,
            "subject": self.subject,
            "message": self.message,
            "status": self.status.value if hasattr(self.status, "value") else str(self.status),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


@router.get("", summary="List all contact submissions (main-site + client-specific)")
async def list_all_contact_submissions(
    tab: str = Query("all", description="all | unread | read | archived"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    client_id: uuid.UUID | None = Query(None, description="Filter by specific client (optional)"),
    include_main_site: bool = Query(True, description="Include main-site submissions (null client_id)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """
    Returns all contact submissions across the platform.
    - Main-site inquiries have `client_id` = null and `client_name` = "[Main Site Inquiry]"
    - Client-specific submissions show the client name and slug
    - Optionally filter by specific client or exclude main-site submissions
    """
    tab_key = (tab or "all").strip().lower()
    if tab_key not in {"all", "unread", "read", "archived"}:
        raise HTTPException(status_code=422, detail="Invalid tab filter")

    status_map = {
        "unread": ContactSubmissionStatus.UNREAD,
        "read": ContactSubmissionStatus.READ,
        "archived": ContactSubmissionStatus.ARCHIVED,
    }

    # Build base query
    base = select(ContactSubmission)

    if client_id:
        # Filter by specific client
        base = base.where(ContactSubmission.client_id == client_id)
    elif not include_main_site:
        # Exclude main-site inquiries (only show client-specific)
        base = base.where(ContactSubmission.client_id.isnot(None))
    # else: include all (both main-site and client-specific)

    if tab_key in status_map:
        base = base.where(ContactSubmission.status == status_map[tab_key])

    # Get total count
    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    # Get paginated items
    items_result = await db.execute(
        base.order_by(ContactSubmission.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = items_result.scalars().all()

    # Fetch client info for all submissions
    client_ids = set(s.client_id for s in items if s.client_id)
    clients_map = {}
    if client_ids:
        clients_result = await db.execute(
            select(Client).where(Client.id.in_(client_ids))
        )
        clients = clients_result.scalars().all()
        clients_map = {c.id: c for c in clients}

    # Build response with client context
    items_with_clients = []
    for submission in items:
        client = clients_map.get(submission.client_id) if submission.client_id else None
        summary = ContactSubmissionSummaryWithClient(submission, client)
        items_with_clients.append(summary.model_dump())

    # Get status counts
    grouped_result = await db.execute(
        select(ContactSubmission.status, func.count())
        .where(*([ContactSubmission.client_id == client_id] if client_id else []))
        .where(*([ContactSubmission.client_id.isnot(None)] if not include_main_site else []))
        .group_by(ContactSubmission.status)
    )
    grouped = {k.value if hasattr(k, "value") else str(k): v for k, v in grouped_result.all()}
    unread_count = int(grouped.get("unread", 0))
    read_count = int(grouped.get("read", 0))
    archived_count = int(grouped.get("archived", 0))

    return {
        "items": items_with_clients,
        "total": total,
        "page": page,
        "page_size": page_size,
        "counts": {
            "all": unread_count + read_count + archived_count,
            "unread": unread_count,
            "read": read_count,
            "archived": archived_count,
        },
    }


@router.get("/{submission_id}", summary="Get a specific contact submission with client details")
async def get_contact_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """Returns submission details along with associated client info (if applicable)"""
    result = await db.execute(
        select(ContactSubmission).where(ContactSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Contact submission not found")

    # Fetch client info if submission is client-specific
    client = None
    if submission.client_id:
        client_result = await db.execute(
            select(Client).where(Client.id == submission.client_id)
        )
        client = client_result.scalar_one_or_none()

    # Mark as read if unread
    if submission.status == ContactSubmissionStatus.UNREAD:
        submission.status = ContactSubmissionStatus.READ
        await db.commit()
        await db.refresh(submission)

    summary = ContactSubmissionSummaryWithClient(submission, client)
    return summary.model_dump()


@router.patch("/{submission_id}/archive", summary="Archive a contact submission")
async def archive_contact_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """Mark a submission as archived"""
    result = await db.execute(
        select(ContactSubmission).where(ContactSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Contact submission not found")

    submission.status = ContactSubmissionStatus.ARCHIVED
    await db.commit()
    await db.refresh(submission)

    # Fetch client info for response
    client = None
    if submission.client_id:
        client_result = await db.execute(
            select(Client).where(Client.id == submission.client_id)
        )
        client = client_result.scalar_one_or_none()

    summary = ContactSubmissionSummaryWithClient(submission, client)
    return summary.model_dump()


@router.patch("/{submission_id}/read", summary="Mark a contact submission as read")
async def mark_as_read(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """Mark a submission as read"""
    result = await db.execute(
        select(ContactSubmission).where(ContactSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Contact submission not found")

    if submission.status != ContactSubmissionStatus.READ:
        submission.status = ContactSubmissionStatus.READ
        await db.commit()
        await db.refresh(submission)

    # Fetch client info for response
    client = None
    if submission.client_id:
        client_result = await db.execute(
            select(Client).where(Client.id == submission.client_id)
        )
        client = client_result.scalar_one_or_none()

    summary = ContactSubmissionSummaryWithClient(submission, client)
    return summary.model_dump()
