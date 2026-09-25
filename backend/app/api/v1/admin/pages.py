import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.page import ClientPage
from app.schemas.client.page import PageCreate, PageOut, PageUpdate

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_page_or_404(page_id: uuid.UUID, client_id: uuid.UUID, db: AsyncSession) -> ClientPage:
    result = await db.execute(
        select(ClientPage).where(
            ClientPage.id == page_id,
            ClientPage.client_id == client_id,
        )
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found.")
    return page


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PageOut], summary="List all pages for this client")
async def list_pages(
    search: str | None = Query(None, description="Filter by title"),
    page_status: str | None = Query(None, description="Filter by status (draft|published)", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = select(ClientPage).where(ClientPage.client_id == admin._client_id)
    if search:
        q = q.where(ClientPage.title.ilike(f"%{search}%"))
    if page_status:
        q = q.where(ClientPage.status == page_status)
    q = q.order_by(ClientPage.sort_order, ClientPage.created_at.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    return result.scalars().all()


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=PageOut, status_code=status.HTTP_201_CREATED, summary="Create a new page")
async def create_page(
    payload: PageCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    # Enforce unique slug per client
    existing = await db.execute(
        select(ClientPage).where(
            ClientPage.client_id == admin._client_id,
            ClientPage.slug == payload.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A page with slug '{payload.slug}' already exists.",
        )

    db_page = ClientPage(client_id=admin._client_id, **payload.model_dump())
    db.add(db_page)
    await db.commit()
    await db.refresh(db_page)
    return db_page


# ─── Get single ───────────────────────────────────────────────────────────────

@router.get("/{page_id}", response_model=PageOut, summary="Get a single page by ID")
async def get_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    return await _get_page_or_404(page_id, admin._client_id, db)


# ─── Update ───────────────────────────────────────────────────────────────────

@router.patch("/{page_id}", response_model=PageOut, summary="Update a page")
async def update_page(
    page_id: uuid.UUID,
    payload: PageUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    db_page = await _get_page_or_404(page_id, admin._client_id, db)

    # Check slug uniqueness if slug is being changed
    if payload.slug and payload.slug != db_page.slug:
        existing = await db.execute(
            select(ClientPage).where(
                ClientPage.client_id == admin._client_id,
                ClientPage.slug == payload.slug,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A page with slug '{payload.slug}' already exists.",
            )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_page, field, value)

    await db.commit()
    await db.refresh(db_page)
    return db_page


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a page")
async def delete_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    db_page = await _get_page_or_404(page_id, admin._client_id, db)
    await db.delete(db_page)
    await db.commit()
