import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.models.client.content import ContentTag
from app.schemas.client.tags import TagCreate, TagOut

router = APIRouter()


async def resolve_tag_names(db: AsyncSession, client_id: uuid.UUID, names: list[str]) -> list[str]:
    if not names:
        return []
    unique = {name.casefold(): name for name in names}
    statement = insert(ContentTag).values([
        {"client_id": client_id, "name": name, "normalized_name": key}
        for key, name in sorted(unique.items())
    ]).on_conflict_do_update(
        constraint="uq_content_tags_client_name", set_={"name": ContentTag.name}
    ).returning(ContentTag.normalized_name, ContentTag.name)
    result = await db.execute(statement)
    canonical = dict(result.all())
    return [canonical[key] for key in unique]


@router.get("", response_model=list[TagOut])
async def list_tags(
    search: str = Query("", max_length=80),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    query = select(ContentTag).where(ContentTag.client_id == admin._client_id)
    if search.strip():
        query = query.where(ContentTag.normalized_name.contains(" ".join(search.split()).casefold(), autoescape=True))
    result = await db.execute(query.order_by(ContentTag.normalized_name).limit(limit))
    return result.scalars().all()


@router.post("", response_model=TagOut)
async def create_tag(
    payload: TagCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    names = await resolve_tag_names(db, admin._client_id, [payload.name])
    result = await db.execute(select(ContentTag).where(
        ContentTag.client_id == admin._client_id,
        ContentTag.normalized_name == names[0].casefold(),
    ))
    return result.scalar_one()