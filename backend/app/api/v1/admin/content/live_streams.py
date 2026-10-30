import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core import aws_live, live_pipeline
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.models.superadmin.client import Client
from app.models.client.content import (
    Category,
    LiveAdBreak,
    LiveStream,
    livestream_categories as livestream_categories_table,
)
from app.schemas.client.content import (
    LiveAdBreakIn,
    LiveAdBreakOut,
    LiveOptionsIn,
    LivePipelineStatusOut,
    LivePipelinesOut,
    LiveStreamCreate,
    LiveStreamOut,
    LiveStreamUpdate,
    LiveVodExportIn,
)

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _build_rtmp_credentials(slug: str) -> dict:
    """Generate a secure stream key and derive the HLS playback URL."""
    token = secrets.token_urlsafe(16)
    rtmp_key = f"{slug}-{token}"
    stream_url = (
        f"{settings.RTMP_HLS_BASE_URL}/{rtmp_key}.m3u8"
        if settings.RTMP_HLS_BASE_URL
        else None
    )
    return {"rtmp_key": rtmp_key, "stream_url": stream_url}


async def _get_owned_stream(db: AsyncSession, stream_id: uuid.UUID, admin) -> LiveStream:
    result = await db.execute(
        select(LiveStream).where(LiveStream.id == stream_id, LiveStream.client_id == admin._client_id)
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")
    return stream


def _ready_state(stream: LiveStream) -> dict:
    """The managed-pipeline state of a channel that is provisioned and usable."""
    state = dict(stream.aws_live or {})
    if state.get("status") != "ready":
        raise HTTPException(status_code=409, detail="Managed live pipeline is not ready for this channel")
    return state


def _aws_error(exc: aws_live.LiveAwsError) -> HTTPException:
    return HTTPException(status_code=502, detail=str(exc))


@router.get("", response_model=list[LiveStreamOut])
async def list_streams(
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = select(LiveStream).where(LiveStream.client_id == admin._client_id)
    if search:
        q = q.where(
            or_(
                LiveStream.title.ilike(f"%{search}%"),
                LiveStream.slug.ilike(f"%{search}%"),
            )
        )
    q = q.order_by(LiveStream.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/pipelines", response_model=LivePipelinesOut)
async def list_pipelines(admin=Depends(get_current_client_admin)):
    """Streaming engines a new RTMP channel can use, and whether each is ready on this server."""
    aws_missing = aws_live.missing_configuration()
    return LivePipelinesOut(
        default=aws_live.default_pipeline(),
        legacy=LivePipelineStatusOut(
            available=bool(settings.RTMP_SERVER_HOST),
            missing=[] if settings.RTMP_SERVER_HOST else ["RTMP_SERVER_HOST"],
        ),
        aws=LivePipelineStatusOut(available=not aws_missing, missing=aws_missing),
    )


@router.post("", response_model=LiveStreamOut, status_code=status.HTTP_201_CREATED)
async def create_stream(
    payload: LiveStreamCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    category_slugs = payload.categories or []
    data = payload.model_dump(exclude={"categories", "live_options", "pipeline"})
    pipeline = payload.pipeline or aws_live.default_pipeline()
    managed = payload.source == "rtmp" and pipeline == "aws"
    if managed:
        missing = aws_live.missing_configuration()
        if missing:
            raise HTTPException(
                status_code=503,
                detail=f"Managed live pipeline is not configured. Missing: {', '.join(missing)}",
            )
    # Auto-generate RTMP credentials when source is RTMP
    if payload.source == "rtmp":
        creds = _build_rtmp_credentials(payload.slug)
        data["rtmp_key"] = creds["rtmp_key"]
        # Managed channels are played through authorized CDN URLs only — never a public stream_url.
        data["stream_url"] = None if managed else creds["stream_url"]
        if managed:
            options = payload.live_options.model_dump() if payload.live_options else None
            data["aws_live"] = {"status": "provisioning", "options": aws_live.normalize_options(options)}
    stream = LiveStream(client_id=admin._client_id, **data)
    db.add(stream)
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
                insert(livestream_categories_table).values(
                    [{"livestream_id": stream.id, "category_id": c.id} for c in c_list]
                ).on_conflict_do_nothing()
            )
    await db.flush()
    await db.refresh(stream)
    if managed:
        await db.commit()  # the background task reads this row from its own session
        background_tasks.add_task(live_pipeline.provision_stream, stream.id)
    return stream


@router.get("/{stream_id}", response_model=LiveStreamOut)
async def get_stream(
    stream_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")
    return stream


@router.patch("/{stream_id}", response_model=LiveStreamOut)
async def update_stream(
    stream_id: uuid.UUID,
    payload: LiveStreamUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")

    updates = payload.model_dump(exclude_unset=True)
    category_slugs = updates.pop("categories", None)
    if stream.aws_live:
        # Managed channels are fixed to the pipeline source and never expose a public URL.
        updates.pop("stream_url", None)
        updates.pop("source", None)
    for field, value in updates.items():
        setattr(stream, field, value)
    if category_slugs is not None:
        await db.execute(
            delete(livestream_categories_table).where(
                livestream_categories_table.c.livestream_id == stream.id
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
                    insert(livestream_categories_table).values(
                        [{"livestream_id": stream.id, "category_id": c.id} for c in c_list]
                    ).on_conflict_do_nothing()
                )
    await db.flush()
    await db.refresh(stream)
    return stream


@router.delete("/{stream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stream(
    stream_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")
    state = dict(stream.aws_live or {})
    if state.get("medialive_channel_id"):
        if state.get("channel_state") not in {"IDLE", None}:
            raise HTTPException(status_code=409, detail="Stop the channel before deleting it")
        background_tasks.add_task(live_pipeline.teardown, state)
    await db.delete(stream)


@router.patch("/{stream_id}/toggle-live", response_model=LiveStreamOut)
async def toggle_live(
    stream_id: uuid.UUID,
    is_live: bool,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")

    stream.is_live = is_live
    await db.flush()
    await db.refresh(stream)
    return stream


@router.post("/{stream_id}/regenerate-key", response_model=LiveStreamOut)
async def regenerate_rtmp_key(
    stream_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Generate a fresh RTMP stream key (invalidates the previous key immediately)."""
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id, LiveStream.client_id == admin._client_id
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found")
    if stream.source != "rtmp":
        raise HTTPException(status_code=400, detail="Channel source is not RTMP")

    creds = _build_rtmp_credentials(stream.slug)
    if stream.aws_live:
        state = _ready_state(stream)
        if state.get("channel_state") not in {"IDLE", None}:
            raise HTTPException(status_code=409, detail="Stop the channel before rotating its stream key")
        try:
            ingest_urls = await run_in_threadpool(aws_live.rotate_input_key, state, creds["rtmp_key"])
        except aws_live.LiveAwsError as exc:
            raise _aws_error(exc) from exc
        stream.aws_live = {**state, "ingest_urls": ingest_urls}
        stream.rtmp_key = creds["rtmp_key"]
    else:
        stream.rtmp_key = creds["rtmp_key"]
        stream.stream_url = creds["stream_url"]  # new HLS playback URL
    stream.is_live = False
    stream.stream_status = "idle"
    await db.flush()
    await db.refresh(stream)
    return stream


# ─── Managed live pipeline (MediaLive → MediaPackage → CloudFront / MediaTailor) ─────────────

@router.post("/{stream_id}/managed/provision", response_model=LiveStreamOut, status_code=status.HTTP_202_ACCEPTED)
async def retry_provisioning(
    stream_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    """Re-run provisioning after a failure (e.g. missing IAM permission)."""
    stream = await _get_owned_stream(db, stream_id, admin)
    state = dict(stream.aws_live or {})
    if not aws_live.is_available() or stream.source != "rtmp" or state.get("status") != "error":
        raise HTTPException(status_code=409, detail="Channel cannot be provisioned in its current state")
    stream.aws_live = {**state, "status": "provisioning", "error": None}
    stream.stream_url = None
    await db.commit()
    await db.refresh(stream)  # updated_at is expired by the commit; serializing it would raise outside the greenlet
    background_tasks.add_task(live_pipeline.provision_stream, stream.id)
    return stream


@router.put("/{stream_id}/managed/options", response_model=LiveStreamOut)
async def update_live_options(
    stream_id: uuid.UUID,
    payload: LiveOptionsIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    """Change ad insertion / VOD recording settings for a provisioned channel."""
    stream = await _get_owned_stream(db, stream_id, admin)
    state = _ready_state(stream)
    tenant_domain = await db.scalar(select(Client.domain).where(Client.id == stream.client_id))
    try:
        stream.aws_live = await run_in_threadpool(
            lambda: aws_live.update_ads(
                stream_id=stream.id,
                client_slug=getattr(admin, "_client_slug", "") or str(admin._client_id),
                state=state,
                options=payload.model_dump(),
                tenant_domain=tenant_domain,
            )
        )
    except aws_live.LiveAwsError as exc:
        raise _aws_error(exc) from exc
    await db.flush()
    await db.refresh(stream)
    return stream


@router.post("/{stream_id}/managed/start", response_model=LiveStreamOut)
async def start_managed_channel(
    stream_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Start the MediaLive channel so the encoder (OBS) can connect. MediaLive bills while it runs."""
    stream = await _get_owned_stream(db, stream_id, admin)
    state = _ready_state(stream)
    if state.get("channel_state") not in {"IDLE", None}:
        raise HTTPException(status_code=409, detail="Channel is already running")
    try:
        await run_in_threadpool(aws_live.start_channel, state)
    except aws_live.LiveAwsError as exc:
        raise _aws_error(exc) from exc
    stream.aws_live = {**state, "channel_state": "STARTING", "vod": None}
    await db.flush()
    await db.refresh(stream)
    return stream


@router.post("/{stream_id}/managed/stop", response_model=LiveStreamOut)
async def stop_managed_channel(
    stream_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Stop the MediaLive channel. The poller then exports the broadcast as a VOD draft if enabled."""
    stream = await _get_owned_stream(db, stream_id, admin)
    state = _ready_state(stream)
    if state.get("channel_state") in {"IDLE", None, "STOPPING"}:
        raise HTTPException(status_code=409, detail="Channel is not running")
    try:
        await run_in_threadpool(aws_live.stop_channel, state)
    except aws_live.LiveAwsError as exc:
        raise _aws_error(exc) from exc
    stream.aws_live = {**state, "channel_state": "STOPPING"}
    await db.flush()
    await db.refresh(stream)
    return stream


@router.post("/{stream_id}/ad-breaks", response_model=LiveAdBreakOut, status_code=status.HTTP_201_CREATED)
async def trigger_ad_break(
    stream_id: uuid.UUID,
    payload: LiveAdBreakIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Interrupt the live feed with an ad break (SCTE-35 splice_insert → server-side ad insertion)."""
    stream = await _get_owned_stream(db, stream_id, admin)
    state = _ready_state(stream)
    if not (state.get("options") or {}).get("ads_enabled"):
        raise HTTPException(status_code=409, detail="Ads are not enabled for this channel")
    if state.get("channel_state") != "RUNNING":
        raise HTTPException(status_code=409, detail="Channel must be running to insert an ad break")

    ad_break = LiveAdBreak(
        client_id=stream.client_id,
        live_stream_id=stream.id,
        duration_seconds=payload.duration_seconds,
        splice_event_id=0,
        requested_by=admin.id,
    )
    try:
        ad_break.splice_event_id = await run_in_threadpool(
            lambda: aws_live.signal_ad_break(state, duration_seconds=payload.duration_seconds)
        )
    except aws_live.LiveAwsError as exc:
        ad_break.status = "failed"
        ad_break.error_message = str(exc)[:500]
        db.add(ad_break)
        await db.commit()  # keep the failed attempt in the audit trail
        raise _aws_error(exc) from exc
    db.add(ad_break)
    await db.flush()
    await db.refresh(ad_break)
    return ad_break


@router.get("/{stream_id}/ad-breaks", response_model=list[LiveAdBreakOut])
async def list_ad_breaks(
    stream_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    stream = await _get_owned_stream(db, stream_id, admin)
    result = await db.execute(
        select(LiveAdBreak)
        .where(LiveAdBreak.live_stream_id == stream.id)
        .order_by(LiveAdBreak.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/{stream_id}/managed/export-vod", response_model=LiveStreamOut, status_code=status.HTTP_202_ACCEPTED)
async def export_vod(
    stream_id: uuid.UUID,
    payload: LiveVodExportIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Save a time range of the live channel (within the DVR window) as a draft VOD video."""
    stream = await _get_owned_stream(db, stream_id, admin)
    state = _ready_state(stream)
    if (state.get("vod") or {}).get("status") == "harvesting":
        raise HTTPException(status_code=409, detail="A VOD export is already in progress")
    start, end = payload.start, payload.end
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(status_code=422, detail="start and end must include a timezone")
    if end <= start or end > datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Invalid time range")
    try:
        stream.aws_live = await live_pipeline.start_vod_export(
            db, stream, state, getattr(admin, "_client_slug", "") or str(admin._client_id), start, end
        )
    except aws_live.LiveAwsError as exc:
        raise _aws_error(exc) from exc
    await db.flush()
    await db.refresh(stream)
    return stream

