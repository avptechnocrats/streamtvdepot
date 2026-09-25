import uuid
from typing import Sequence

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.storage import media_display_url
from app.models.client.content import Category, MediaAsset
from app.schemas.client.content import CategoryCreate, CategoryListResponse, CategoryOut, CategoryUpdate

router = APIRouter()


async def _resolve_asset(
    db: AsyncSession,
    asset_id: uuid.UUID,
    client_id: uuid.UUID,
    field_label: str,
) -> MediaAsset:
    """Fetch a MediaAsset and verify it belongs to this client."""
    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == asset_id,
            MediaAsset.client_id == client_id,
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail=f"{field_label} asset not found")
    return asset


async def _apply_assets(payload_dict: dict, db: AsyncSession, client_id: uuid.UUID) -> dict:
    """
    If thumbnail_asset_id or banner_asset_id are present, resolve their URLs
    and write them into thumbnail_url / banner_url.
    """
    if payload_dict.get("thumbnail_asset_id"):
        asset = await _resolve_asset(db, payload_dict["thumbnail_asset_id"], client_id, "Thumbnail")
        payload_dict["thumbnail_url"] = asset.url

    if payload_dict.get("banner_asset_id"):
        asset = await _resolve_asset(db, payload_dict["banner_asset_id"], client_id, "Banner")
        payload_dict["banner_url"] = asset.url

    return payload_dict


async def _with_display_urls(
    categories: Sequence[Category],
    db: AsyncSession,
) -> list[CategoryOut]:
    """
    Batch-fetch linked MediaAssets and populate thumbnail_display_url /
    banner_display_url with fresh 7-day presigned GET URLs on every read.
    One extra DB query per request regardless of how many categories are returned.
    """
    # Collect all asset IDs referenced by this batch
    asset_ids: set[uuid.UUID] = set()
    for cat in categories:
        if cat.thumbnail_asset_id:
            asset_ids.add(cat.thumbnail_asset_id)
        if cat.banner_asset_id:
            asset_ids.add(cat.banner_asset_id)

    # Batch-load assets in a single query (include original_filename for content-disposition)
    asset_map: dict[uuid.UUID, str] = {}  # id → presigned GET URL
    if asset_ids:
        rows = await db.execute(
            select(MediaAsset.id, MediaAsset.s3_key, MediaAsset.original_filename)
            .where(MediaAsset.id.in_(asset_ids))
        )
        for asset_id, s3_key, original_filename in rows.all():
            url = media_display_url(s3_key, original_filename=original_filename)
            if url:
                asset_map[asset_id] = url

    # Build CategoryOut instances with display URLs
    out: list[CategoryOut] = []
    for cat in categories:
        item = CategoryOut.model_validate(cat)
        if cat.thumbnail_asset_id and cat.thumbnail_asset_id in asset_map:
            item.thumbnail_display_url = asset_map[cat.thumbnail_asset_id]
        if cat.banner_asset_id and cat.banner_asset_id in asset_map:
            item.banner_display_url = asset_map[cat.banner_asset_id]
        out.append(item)
    return out


@router.get("", response_model=CategoryListResponse)
async def list_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = None,
    parent_only: bool = False,
    content_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = select(Category).where(Category.client_id == admin._client_id)
    if search:
        q = q.where(Category.name.ilike(f"%{search}%"))
    if parent_only:
        q = q.where(Category.is_parent.is_(True))
    if content_type:
        q = q.where(Category.content_types.contains([content_type]))

    total = await db.scalar(select(func.count()).select_from(q.subquery()))

    q = q.offset((page - 1) * page_size).limit(page_size).order_by(Category.sort_order, Category.name)
    result = await db.execute(q)
    items = await _with_display_urls(result.scalars().all(), db)
    return CategoryListResponse(items=items, total=total or 0, page=page, page_size=page_size)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    # Validate slug uniqueness per client
    existing = await db.execute(
        select(Category).where(
            Category.client_id == admin._client_id,
            Category.slug == payload.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A category with slug '{payload.slug}' already exists",
        )

    # Validate parent_id if provided
    if payload.parent_id:
        parent = await db.execute(
            select(Category).where(
                Category.id == payload.parent_id,
                Category.client_id == admin._client_id,
            )
        )
        if not parent.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Parent category not found")

    data = await _apply_assets(payload.model_dump(), db, admin._client_id)
    category = Category(client_id=admin._client_id, **data)
    db.add(category)
    await db.flush()
    await db.refresh(category)
    items = await _with_display_urls([category], db)
    return items[0]


class ReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_categories(
    items: list[ReorderItem],
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    if not items:
        return
    ids = [item.id for item in items]
    result = await db.execute(
        select(Category).where(
            Category.client_id == admin._client_id,
            Category.id.in_(ids),
        )
    )
    cat_map = {c.id: c for c in result.scalars().all()}
    for item in items:
        if item.id in cat_map:
            cat_map[item.id].sort_order = item.sort_order
    await db.flush()


@router.get("/{category_id}", response_model=CategoryOut)
async def get_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.client_id == admin._client_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    items = await _with_display_urls([category], db)
    return items[0]


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.client_id == admin._client_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    updates = payload.model_dump(exclude_unset=True)

    # Validate slug uniqueness if it's being changed
    if "slug" in updates and updates["slug"] != category.slug:
        clash = await db.execute(
            select(Category).where(
                Category.client_id == admin._client_id,
                Category.slug == updates["slug"],
                Category.id != category_id,
            )
        )
        if clash.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A category with slug '{updates['slug']}' already exists",
            )

    # Validate parent_id if being changed
    if "parent_id" in updates and updates["parent_id"]:
        if updates["parent_id"] == category_id:
            raise HTTPException(status_code=422, detail="A category cannot be its own parent")
        parent = await db.execute(
            select(Category).where(
                Category.id == updates["parent_id"],
                Category.client_id == admin._client_id,
            )
        )
        if not parent.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Parent category not found")

    updates = await _apply_assets(updates, db, admin._client_id)

    for field, value in updates.items():
        setattr(category, field, value)

    await db.flush()
    await db.refresh(category)
    items = await _with_display_urls([category], db)
    return items[0]


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.client_id == admin._client_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(category)


