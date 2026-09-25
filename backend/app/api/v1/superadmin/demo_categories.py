import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.demo_content import DemoCategory
from app.schemas.superadmin.demo_category import DemoCategoryCreate, DemoCategoryOut, DemoCategoryUpdate

router = APIRouter()


@router.get("", response_model=list[DemoCategoryOut])
async def list_demo_categories(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(DemoCategory).order_by(DemoCategory.sort_order, DemoCategory.name)
    )
    return result.scalars().all()


@router.post("", response_model=DemoCategoryOut, status_code=status.HTTP_201_CREATED)
async def create_demo_category(
    payload: DemoCategoryCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    existing = await db.execute(
        select(DemoCategory).where(DemoCategory.slug == payload.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Category slug already exists")
    cat = DemoCategory(**payload.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.patch("/{category_id}", response_model=DemoCategoryOut)
async def update_demo_category(
    category_id: uuid.UUID,
    payload: DemoCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(DemoCategory).where(DemoCategory.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Demo category not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_demo_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(DemoCategory).where(DemoCategory.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Demo category not found")
    await db.delete(cat)
