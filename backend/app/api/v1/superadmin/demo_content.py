import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.demo_content import DemoCategory, DemoContent, demo_content_categories
from app.schemas.superadmin.demo_content import DemoContentCreate, DemoContentOut, DemoContentUpdate

router = APIRouter()


async def _load(item_id: uuid.UUID, db: AsyncSession) -> DemoContent:
    result = await db.execute(
        select(DemoContent)
        .options(selectinload(DemoContent.categories))
        .where(DemoContent.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Demo content item not found")
    return item


async def _sync_categories(
    item: DemoContent,
    category_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    await db.execute(
        delete(demo_content_categories).where(
            demo_content_categories.c.demo_content_id == item.id
        )
    )
    for cat_id in category_ids:
        cat = await db.get(DemoCategory, cat_id)
        if not cat:
            raise HTTPException(status_code=404, detail=f"Demo category {cat_id} not found")
        await db.execute(
            demo_content_categories.insert().values(
                demo_content_id=item.id, demo_category_id=cat_id
            )
        )


@router.get("", response_model=list[DemoContentOut])
async def list_demo_content(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(DemoContent)
        .options(selectinload(DemoContent.categories))
        .order_by(DemoContent.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=DemoContentOut, status_code=status.HTTP_201_CREATED)
async def add_demo_content(
    payload: DemoContentCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    data = payload.model_dump(exclude={"category_ids"})
    item = DemoContent(**data)
    db.add(item)
    await db.flush()
    await _sync_categories(item, payload.category_ids, db)
    await db.flush()
    await db.refresh(item)
    return await _load(item.id, db)


@router.patch("/{item_id}", response_model=DemoContentOut)
async def update_demo_content(
    item_id: uuid.UUID,
    payload: DemoContentUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    item = await _load(item_id, db)
    update_data = payload.model_dump(exclude={"category_ids"}, exclude_none=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    if payload.category_ids is not None:
        await _sync_categories(item, payload.category_ids, db)
    await db.flush()
    return await _load(item.id, db)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_demo_content(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    item = await _load(item_id, db)
    await db.delete(item)
