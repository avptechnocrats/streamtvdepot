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
_THUMBNAIL_PREFIX = "platform/demo-assets/image/"


def _validate_thumbnail_key(s3_key: str | None) -> None:
    if s3_key and not s3_key.startswith(_THUMBNAIL_PREFIX):
        raise HTTPException(status_code=422, detail="Category thumbnails must use an image asset.")


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
    _validate_thumbnail_key(payload.thumbnail_s3_key)
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
    update_data = payload.model_dump(exclude_unset=True)
    if "slug" in update_data and update_data["slug"] != cat.slug:
        existing = await db.execute(
            select(DemoCategory).where(DemoCategory.slug == update_data["slug"])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Category slug already exists")
    _validate_thumbnail_key(update_data.get("thumbnail_s3_key"))
    for field, value in update_data.items():
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
