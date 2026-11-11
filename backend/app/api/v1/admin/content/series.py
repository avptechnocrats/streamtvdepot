import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.episode_transcoding import episode_stream_url, prepare_episode_transcode, process_episode_transcodes, require_publishable_series
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.models.client.content import Category, ContentStatus, Episode, Series, series_categories as series_categories_table
from app.models.client.subscription import ClientSubscriptionPlan, PlanType
from app.schemas.client.content import (
    EpisodeCreate,
    EpisodeOut,
    EpisodeUpdate,
    SeriesCreate,
    SeriesOut,
    SeriesUpdate,
)

from .tags import resolve_tag_names

router = APIRouter()

SERIES_NESTED_FIELDS = {"categories", "episodes", "deleted_episode_ids"}


async def _apply_series_episodes(db: AsyncSession, series: Series, payload: SeriesCreate) -> None:
    result = await db.execute(select(Episode).where(
        Episode.series_id == series.id, Episode.client_id == series.client_id,
    ))
    existing = {episode.id: episode for episode in result.scalars().all()}
    removed = set(payload.deleted_episode_ids)
    supplied_ids = {episode.id for episode in payload.episodes if episode.id}
    if not (removed | supplied_ids).issubset(existing):
        raise HTTPException(status_code=404, detail="Episode not found in this series")
    final_numbers = {
        episode_id: (episode.season_number, episode.episode_number)
        for episode_id, episode in existing.items() if episode_id not in removed | supplied_ids
    }
    numbers = list(final_numbers.values()) + [(episode.season_number, episode.episode_number) for episode in payload.episodes]
    if len(set(numbers)) != len(numbers):
        raise HTTPException(status_code=409, detail="Episode numbers must be unique within each season")
    if any(season > series.total_seasons for season, _ in numbers):
        raise HTTPException(status_code=422, detail="Remove or move episodes before reducing the season count")
    for episode_id in removed:
        await db.delete(existing[episode_id])
    for values in payload.episodes:
        data = values.model_dump(exclude={"id"})
        if values.id:
            episode = existing[values.id]
            for field, value in data.items():
                setattr(episode, field, value)
        else:
            episode = Episode(client_id=series.client_id, series_id=series.id, **data)
            db.add(episode)
        await prepare_episode_transcode(db, episode)


async def _validate_series_payload(
    payload: SeriesCreate | SeriesUpdate,
    client_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    if payload.status != ContentStatus.PUBLISHED or payload.access_type not in {"ppv", "rental"}:
        return

    plan_ids = payload.subscription_plan_ids or []
    if len(plan_ids) != 1:
        raise HTTPException(status_code=422, detail="Paid series requires exactly one active PPV or rental plan.")

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


# ─── Series ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SeriesOut])
async def list_series(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    series_status: ContentStatus | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = select(Series).where(Series.client_id == admin._client_id, Series.deleted_at.is_(None))
    if search:
        q = q.where(Series.title.ilike(f"%{search}%"))
    if series_status is not None:
        q = q.where(Series.status == series_status)
    result = await db.execute(
        q.offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(Series.created_at.desc())
    )
    return result.scalars().all()


@router.get("/trash", response_model=list[SeriesOut])
async def list_trash_series(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Series)
        .where(Series.client_id == admin._client_id, Series.deleted_at.is_not(None))
        .order_by(Series.deleted_at.desc())
    )
    return result.scalars().all()


@router.post("/editor", response_model=SeriesOut, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=SeriesOut, status_code=status.HTTP_201_CREATED)
async def create_series(
    payload: SeriesCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    await _validate_series_payload(payload, admin._client_id, db)
    category_slugs = payload.categories or []
    data = payload.model_dump(exclude=SERIES_NESTED_FIELDS)
    data["tags"] = await resolve_tag_names(db, admin._client_id, payload.tags)
    data["languages"] = payload.languages or ([payload.language] if payload.language else [])
    data["language"] = data["languages"][0] if data["languages"] else None
    series = Series(client_id=admin._client_id, **data)
    db.add(series)
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
                insert(series_categories_table).values(
                    [{"series_id": series.id, "category_id": c.id} for c in c_list]
                ).on_conflict_do_nothing()
            )
    await _apply_series_episodes(db, series, payload)
    if series.status == ContentStatus.PUBLISHED:
        await require_publishable_series(db, series)
    await db.flush()
    await db.commit()
    background_tasks.add_task(process_episode_transcodes)
    await db.refresh(series)
    return series


@router.get("/{series_id}", response_model=SeriesOut)
async def get_series(
    series_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Series).where(
            Series.id == series_id,
            Series.client_id == admin._client_id,
            Series.deleted_at.is_(None),
        )
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    return series


@router.patch("/editor/{series_id}", response_model=SeriesOut)
@router.patch("/{series_id}", response_model=SeriesOut)
async def update_series(
    series_id: uuid.UUID,
    payload: SeriesUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(Series).where(
            Series.id == series_id,
            Series.client_id == admin._client_id,
            Series.deleted_at.is_(None),
        )
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    try:
        merged = SeriesCreate.model_validate({
            **{
                field: getattr(series, field)
                for field in SeriesCreate.model_fields
                if field not in SERIES_NESTED_FIELDS
            },
            "categories": [category.slug for category in series.categories],
            **payload.model_dump(exclude_unset=True),
        })
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors(include_context=False)) from error
    await _validate_series_payload(merged, admin._client_id, db)

    updates = payload.model_dump(exclude_unset=True)
    if "tags" in updates:
        updates["tags"] = await resolve_tag_names(db, admin._client_id, updates["tags"])
    updates.pop("episodes", None)
    updates.pop("deleted_episode_ids", None)
    category_slugs = updates.pop("categories", None)
    if "languages" in updates:
        updates["language"] = updates["languages"][0] if updates["languages"] else None
    elif "language" in updates:
        updates["languages"] = [updates["language"]] if updates["language"] else []
    for field, value in updates.items():
        setattr(series, field, value)
    if category_slugs is not None:
        await db.execute(
            delete(series_categories_table).where(
                series_categories_table.c.series_id == series.id
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
                    insert(series_categories_table).values(
                        [{"series_id": series.id, "category_id": c.id} for c in c_list]
                    ).on_conflict_do_nothing()
                )
    await _apply_series_episodes(db, series, merged)
    if series.status == ContentStatus.PUBLISHED:
        await require_publishable_series(db, series)
    await db.flush()
    await db.commit()
    background_tasks.add_task(process_episode_transcodes)
    await db.refresh(series)
    return series


@router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series(
    series_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Series).where(
            Series.id == series_id,
            Series.client_id == admin._client_id,
            Series.deleted_at.is_(None),
        )
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    series.deleted_at = datetime.now(timezone.utc)


@router.post("/{series_id}/restore", response_model=SeriesOut)
async def restore_series(
    series_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Series).where(
            Series.id == series_id,
            Series.client_id == admin._client_id,
            Series.deleted_at.is_not(None),
        )
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found in trash")
    series.deleted_at = None
    await db.flush()
    await db.refresh(series)
    return series


@router.delete("/{series_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanent_delete_series(
    series_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Series).where(
            Series.id == series_id,
            Series.client_id == admin._client_id,
        )
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    await db.delete(series)


# ─── Episodes ─────────────────────────────────────────────────────────────────

@router.get("/{series_id}/episodes", response_model=list[EpisodeOut])
async def list_episodes(
    series_id: uuid.UUID,
    season: int | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = select(Episode).where(
        Episode.series_id == series_id, Episode.client_id == admin._client_id
    )
    if season is not None:
        q = q.where(Episode.season_number == season)
    q = q.order_by(Episode.season_number, Episode.episode_number)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/{series_id}/episodes", response_model=EpisodeOut, status_code=status.HTTP_201_CREATED)
async def create_episode(
    series_id: uuid.UUID,
    payload: EpisodeCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    series = await db.scalar(select(Series).where(
        Series.id == series_id, Series.client_id == admin._client_id, Series.deleted_at.is_(None),
    ))
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if payload.series_id != series_id or not 1 <= payload.season_number <= series.total_seasons or payload.episode_number < 1:
        raise HTTPException(status_code=422, detail="Invalid series or season/episode number")
    duplicate = await db.scalar(select(Episode.id).where(
        Episode.series_id == series_id, Episode.client_id == admin._client_id,
        Episode.season_number == payload.season_number, Episode.episode_number == payload.episode_number,
    ))
    if duplicate:
        raise HTTPException(status_code=409, detail="Episode number already exists in this season")
    episode = Episode(
        client_id=admin._client_id,
        series_id=series_id,
        title=payload.title,
        description=payload.description,
        season_number=payload.season_number,
        episode_number=payload.episode_number,
        duration_seconds=payload.duration_seconds,
        video_url=payload.video_url,
        thumbnail_url=payload.thumbnail_url,
        status=payload.status,
    )
    db.add(episode)
    await prepare_episode_transcode(db, episode)
    if series.status == ContentStatus.PUBLISHED:
        await require_publishable_series(db, series)
    await db.flush()
    await db.commit()
    background_tasks.add_task(process_episode_transcodes)
    await db.refresh(episode)
    return episode


@router.patch("/{series_id}/episodes/{episode_id}", response_model=EpisodeOut)
async def update_episode(
    series_id: uuid.UUID,
    episode_id: uuid.UUID,
    payload: EpisodeUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Episode).where(
            Episode.id == episode_id,
            Episode.series_id == series_id,
            Episode.client_id == admin._client_id,
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field != "series_id":
            setattr(episode, field, value)
    await prepare_episode_transcode(db, episode)
    series = await db.scalar(select(Series).where(Series.id == series_id, Series.client_id == admin._client_id))
    if series.status == ContentStatus.PUBLISHED:
        await require_publishable_series(db, series)
    await db.flush()
    await db.commit()
    background_tasks.add_task(process_episode_transcodes)
    await db.refresh(episode)
    return episode


@router.post("/{series_id}/episodes/{episode_id}/transcode", response_model=EpisodeOut)
async def retry_episode_transcode(
    series_id: uuid.UUID, episode_id: uuid.UUID, background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db), admin=Depends(get_current_client_admin_with_active_plan),
):
    episode = await db.scalar(select(Episode).where(
        Episode.id == episode_id, Episode.series_id == series_id, Episode.client_id == admin._client_id,
    ))
    if not episode or not episode.video_url:
        raise HTTPException(status_code=404, detail="Episode source not found")
    await prepare_episode_transcode(db, episode, retry=True)
    await db.commit()
    background_tasks.add_task(process_episode_transcodes)
    await db.refresh(episode)
    return episode


@router.get("/{series_id}/episodes/{episode_id}/preview")
async def preview_episode_stream(
    series_id: uuid.UUID, episode_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), admin=Depends(get_current_client_admin),
):
    episode = await db.scalar(select(Episode).where(
        Episode.id == episode_id, Episode.series_id == series_id, Episode.client_id == admin._client_id,
    ))
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return {"stream_url": episode_stream_url(episode, str(admin.id), preview=True)}


@router.delete("/{series_id}/episodes/{episode_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_episode(
    series_id: uuid.UUID,
    episode_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Episode).where(
            Episode.id == episode_id,
            Episode.series_id == series_id,
            Episode.client_id == admin._client_id,
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    await db.delete(episode)
