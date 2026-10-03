import uuid
import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.dependencies import get_current_superadmin
from app.core.mediaconvert import create_hls_job
from app.models.superadmin.demo_content import DemoCategory, DemoContent, demo_content_categories
from app.schemas.superadmin.demo_content import DemoContentCreate, DemoContentOut, DemoContentPage, DemoContentType, DemoContentUpdate

router = APIRouter()
logger = logging.getLogger(__name__)
_DEMO_TRANSCODE_NAMESPACE = "platform-demo"


def _require_mediaconvert_configuration() -> None:
    missing = []
    if not settings.AWS_ACCESS_KEY_ID:
        missing.append("AWS_ACCESS_KEY_ID")
    if not settings.AWS_SECRET_ACCESS_KEY:
        missing.append("AWS_SECRET_ACCESS_KEY")
    if not settings.MEDIACONVERT_ROLE_ARN:
        missing.append("MEDIACONVERT_ROLE_ARN")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"MediaConvert is not configured. Missing env vars: {', '.join(missing)}",
        )


async def _submit_demo_transcode(item_id: str, stream_s3_key: str) -> None:
    loop = asyncio.get_running_loop()
    try:
        job_id = await loop.run_in_executor(
            None,
            lambda: create_hls_job(
                input_s3_key=stream_s3_key,
                client_slug=_DEMO_TRANSCODE_NAMESPACE,
                video_id=item_id,
            ),
        )
        async with AsyncSessionLocal() as db:
            item = await db.get(DemoContent, uuid.UUID(item_id))
            if item:
                item.transcode_job_id = job_id
                item.transcode_status = "processing"
                item.transcode_progress = 0
                await db.commit()
    except Exception as exc:
        logger.exception("Demo MediaConvert submission failed for %s", item_id)
        async with AsyncSessionLocal() as db:
            item = await db.get(DemoContent, uuid.UUID(item_id))
            if item:
                item.transcode_status = "failed"
                item.transcode_job_id = f"error:{str(exc)[:240]}"
                await db.commit()


async def _queue_demo_transcode(
    item: DemoContent,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
) -> None:
    if not item.stream_s3_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Upload a platform demo video before transcoding.",
        )
    _require_mediaconvert_configuration()
    item.transcode_status = "pending"
    item.transcode_progress = 0
    item.transcode_job_id = None
    item.hls_manifest_key = None
    item.hls_url = None
    await db.flush()
    background_tasks.add_task(_submit_demo_transcode, str(item.id), item.stream_s3_key)


async def _load(item_id: uuid.UUID, db: AsyncSession) -> DemoContent:
    result = await db.execute(
        select(DemoContent)
        .execution_options(populate_existing=True)
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


@router.get("", response_model=DemoContentPage)
async def list_demo_content(
    content_type: DemoContentType = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    query = (
        select(DemoContent)
        .options(selectinload(DemoContent.categories))
        .where(DemoContent.content_type == content_type)
    )
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    result = await db.execute(
        query.order_by(DemoContent.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return DemoContentPage(
        items=result.scalars().all(),
        page=page,
        page_size=page_size,
        total=total or 0,
        has_more=(page * page_size) < (total or 0),
    )


@router.post("", response_model=DemoContentOut, status_code=status.HTTP_201_CREATED)
async def add_demo_content(
    payload: DemoContentCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    data = payload.model_dump(exclude={"category_ids"})
    item = DemoContent(**data)
    db.add(item)
    await db.flush()
    await _sync_categories(item, payload.category_ids, db)
    await db.flush()
    if item.content_type == "video" and item.status == "published" and item.stream_s3_key:
        await _queue_demo_transcode(item, db, background_tasks)
    return await _load(item.id, db)


@router.patch("/{item_id}", response_model=DemoContentOut)
async def update_demo_content(
    item_id: uuid.UUID,
    payload: DemoContentUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    item = await _load(item_id, db)
    update_data = payload.model_dump(exclude={"category_ids"}, exclude_none=True)
    source_changed = (
        "stream_s3_key" in update_data
        and update_data["stream_s3_key"] != item.stream_s3_key
    )
    was_published = item.status == "published"
    for field, value in update_data.items():
        setattr(item, field, value)
    if source_changed:
        item.transcode_status = None
        item.transcode_progress = None
        item.transcode_job_id = None
        item.hls_manifest_key = None
        item.hls_url = None
    if payload.category_ids is not None:
        await _sync_categories(item, payload.category_ids, db)
    await db.flush()
    should_auto_transcode = (
        item.content_type == "video"
        and item.status == "published"
        and item.stream_s3_key
        and payload.status == "published"
        and (source_changed or not was_published or item.transcode_status is None)
        and item.transcode_status not in {"pending", "processing", "complete"}
    )
    if should_auto_transcode:
        await _queue_demo_transcode(item, db, background_tasks)
    return await _load(item.id, db)


@router.post("/{item_id}/transcode", response_model=DemoContentOut)
async def trigger_demo_content_transcode(
    item_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    item = await _load(item_id, db)
    if item.content_type != "video":
        raise HTTPException(status_code=422, detail="Only demo videos can be transcoded.")
    if item.transcode_status in {"pending", "processing"}:
        raise HTTPException(status_code=409, detail="Demo video transcoding is already in progress.")
    await _queue_demo_transcode(item, db, background_tasks)
    return await _load(item.id, db)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_demo_content(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    item = await _load(item_id, db)
    await db.delete(item)
