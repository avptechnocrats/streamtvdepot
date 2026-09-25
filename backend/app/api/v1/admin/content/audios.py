import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.models.client.content import Audio, Category, ContentStatus, audio_categories as audio_categories_table
from app.models.client.subscription import ClientSubscriptionPlan, PlanType
from app.schemas.client.content import AudioCreate, AudioOut, AudioUpdate

router = APIRouter()


async def _validate_audio_payload(
    payload: AudioCreate | AudioUpdate,
    client_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    if payload.status != ContentStatus.PUBLISHED:
        return

    if not payload.file_url:
        raise HTTPException(status_code=422, detail="A published audio item requires an audio file.")

    if payload.access_type not in {"ppv", "rental"}:
        return

    plan_ids = payload.subscription_plan_ids or []
    if len(plan_ids) != 1:
        raise HTTPException(
            status_code=422,
            detail="Paid audio requires exactly one active PPV or rental plan.",
        )

    expected_plan_type = PlanType.PPV if payload.access_type == "ppv" else PlanType.RENT
    plan = (await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == plan_ids[0],
            ClientSubscriptionPlan.client_id == client_id,
            ClientSubscriptionPlan.plan_type == expected_plan_type,
            ClientSubscriptionPlan.is_active.is_(True),
        )
    )).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=422, detail="Select an active plan matching the chosen access type.")


@router.get("", response_model=list[AudioOut])
async def list_audios(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    audio_status: ContentStatus | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = select(Audio).where(Audio.client_id == admin._client_id, Audio.deleted_at.is_(None))
    if search:
        q = q.where(Audio.title.ilike(f"%{search}%"))
    if audio_status is not None:
        q = q.where(Audio.status == audio_status)
    q = q.offset((page - 1) * page_size).limit(page_size).order_by(Audio.created_at.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/trash", response_model=list[AudioOut])
async def list_trash_audios(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Audio)
        .where(Audio.client_id == admin._client_id, Audio.deleted_at.is_not(None))
        .order_by(Audio.deleted_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=AudioOut, status_code=status.HTTP_201_CREATED)
async def create_audio(
    payload: AudioCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    await _validate_audio_payload(payload, admin._client_id, db)
    category_slugs = payload.categories or []
    audio = Audio(client_id=admin._client_id, **payload.model_dump(exclude={"categories"}))
    db.add(audio)
    await db.flush()
    if category_slugs:
        cats = await db.execute(
            select(Category).where(
                Category.client_id == admin._client_id,
                Category.slug.in_(category_slugs),
            )
        )
        c_list = list(cats.scalars().all())
        if c_list:
            await db.execute(
                insert(audio_categories_table).values(
                    [{"audio_id": audio.id, "category_id": c.id} for c in c_list]
                ).on_conflict_do_nothing()
            )
    await db.flush()
    await db.refresh(audio)
    return audio


@router.get("/{audio_id}", response_model=AudioOut)
async def get_audio(
    audio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Audio).where(
            Audio.id == audio_id,
            Audio.client_id == admin._client_id,
            Audio.deleted_at.is_(None),
        )
    )
    audio = result.scalar_one_or_none()
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    return audio


@router.patch("/{audio_id}", response_model=AudioOut)
async def update_audio(
    audio_id: uuid.UUID,
    payload: AudioUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(Audio).where(
            Audio.id == audio_id,
            Audio.client_id == admin._client_id,
            Audio.deleted_at.is_(None),
        )
    )
    audio = result.scalar_one_or_none()
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")

    merged = AudioCreate.model_validate({
        **{
            field: getattr(audio, field)
            for field in AudioCreate.model_fields
            if field != "categories"
        },
        "categories": [category.slug for category in audio.categories],
        **payload.model_dump(exclude_unset=True),
    })
    await _validate_audio_payload(merged, admin._client_id, db)

    updates = payload.model_dump(exclude_unset=True)
    category_slugs = updates.pop("categories", None)
    for field, value in updates.items():
        setattr(audio, field, value)
    if category_slugs is not None:
        await db.execute(
            delete(audio_categories_table).where(
                audio_categories_table.c.audio_id == audio.id
            )
        )
        if category_slugs:
            cats = await db.execute(
                select(Category).where(
                    Category.client_id == admin._client_id,
                    Category.slug.in_(category_slugs),
                )
            )
            c_list = list(cats.scalars().all())
            if c_list:
                await db.execute(
                    insert(audio_categories_table).values(
                        [{"audio_id": audio.id, "category_id": c.id} for c in c_list]
                    ).on_conflict_do_nothing()
                )
    await db.flush()
    await db.refresh(audio)
    return audio


@router.delete("/{audio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audio(
    audio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Audio).where(
            Audio.id == audio_id,
            Audio.client_id == admin._client_id,
            Audio.deleted_at.is_(None),
        )
    )
    audio = result.scalar_one_or_none()
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    audio.deleted_at = datetime.now(timezone.utc)


@router.post("/{audio_id}/restore", response_model=AudioOut)
async def restore_audio(
    audio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Audio).where(
            Audio.id == audio_id,
            Audio.client_id == admin._client_id,
            Audio.deleted_at.is_not(None),
        )
    )
    audio = result.scalar_one_or_none()
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found in trash")
    audio.deleted_at = None
    await db.flush()
    await db.refresh(audio)
    return audio


@router.delete("/{audio_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanent_delete_audio(
    audio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Audio).where(
            Audio.id == audio_id,
            Audio.client_id == admin._client_id,
        )
    )
    audio = result.scalar_one_or_none()
    if not audio:
        raise HTTPException(status_code=404, detail="Audio not found")
    await db.delete(audio)
