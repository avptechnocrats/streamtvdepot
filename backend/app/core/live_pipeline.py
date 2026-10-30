"""
Async orchestration for the managed live pipeline: background provisioning, channel-state
reconciliation, and turning finished broadcasts into VOD assets (MediaPackage harvest → S3 → Video).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import aws_live
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.client.content import ContentStatus, LiveStream, Video
from app.models.superadmin.client import Client

logger = logging.getLogger(__name__)

POLL_INTERVAL = 20  # seconds between reconciliation sweeps
INPUT_CHECK_INTERVAL = 60  # seconds between CloudWatch input checks of a running channel
_ACTIVE_STATES = {"STARTING", "RUNNING", "RECOVERING", "STOPPING"}
_LIVE_STATES = {"RUNNING", "RECOVERING"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


async def _load(db: AsyncSession, stream_id: uuid.UUID, *, lock: bool = False) -> tuple[LiveStream, str] | None:
    query = select(LiveStream, Client.slug).join(Client, Client.id == LiveStream.client_id).where(LiveStream.id == stream_id)
    if lock:
        query = query.with_for_update(skip_locked=True, of=LiveStream)
    row = (await db.execute(query)).first()
    return (row[0], row[1]) if row else None


# ─── Provisioning / teardown ────────────────────────────────────────────────

async def provision_stream(stream_id: uuid.UUID) -> None:
    """Background task: create the AWS resources and persist the resulting state."""
    async with AsyncSessionLocal() as db:
        loaded = await _load(db, stream_id)
        if not loaded:
            return
        stream, client_slug = loaded
        current = dict(stream.aws_live or {})
        tenant_domain = await db.scalar(select(Client.domain).where(Client.id == stream.client_id))
        try:
            state = await asyncio.to_thread(
                aws_live.provision,
                stream_id=stream.id,
                client_slug=client_slug,
                rtmp_key=stream.rtmp_key or "",
                options=current.get("options"),
                tenant_domain=tenant_domain,
            )
            stream.aws_live = state
        except Exception as exc:
            logger.exception("Live provisioning failed for stream %s", stream_id)
            stream.aws_live = {**current, "status": "error", "error": str(exc)[:500]}
        await db.commit()


async def teardown(state: dict) -> None:
    try:
        await asyncio.to_thread(aws_live.delete_resources, state)
    except Exception:
        logger.exception("Live teardown failed for %s", state.get("name"))


# ─── Recording → VOD ────────────────────────────────────────────────────────

async def start_vod_export(
    db: AsyncSession,
    stream: LiveStream,
    state: dict,
    client_slug: str,
    start: datetime,
    end: datetime,
) -> dict:
    """Create a draft Video and start the harvest. Returns the new state (caller persists it)."""
    # Harvest can only reach back as far as the origin's start-over window.
    start = max(start, end - timedelta(seconds=settings.LIVE_DVR_WINDOW_SECONDS))
    video_id = uuid.uuid4()
    job = await asyncio.to_thread(
        aws_live.start_harvest, state, client_slug=client_slug, video_id=video_id, start=start, end=end
    )
    geo = dict(stream.geo_fencing or {})
    geo.setdefault("blocked_countries", [])
    geo.setdefault("allowed_countries", [])
    db.add(Video(
        id=video_id,
        client_id=stream.client_id,
        title=f"{stream.title} — {start:%Y-%m-%d %H:%M} UTC",
        slug=f"{stream.slug}-{start:%Y%m%d-%H%M}",
        language=stream.language or None,
        geo_fencing=geo,
        thumbnails=stream.thumbnails or {},
        access_type=stream.access_type,
        subscription_plan_ids=stream.subscription_plan_ids or [],
        status=ContentStatus.DRAFT,
        is_active=True,
        duration=int((end - start).total_seconds()),
        transcode_status="processing",
        transcode_progress=0,
        transcode_job_id=job["job_name"],
    ))
    await db.flush()
    stream.vod_video_id = video_id
    return {
        **state,
        "vod": {
            "status": "harvesting",
            "job_name": job["job_name"],
            "bucket": job["bucket"],
            "path": job["path"],
            "video_id": str(video_id),
            "requested_at": _iso(_now()),
        },
    }


async def _finish_harvest(db: AsyncSession, state: dict) -> dict:
    vod = dict(state["vod"])
    status, error = await asyncio.to_thread(aws_live.get_harvest_status, state, vod["job_name"])
    if status in {"QUEUED", "IN_PROGRESS"}:
        return state

    video = await db.get(Video, uuid.UUID(vod["video_id"]))
    manifest_key = None
    if status == "COMPLETED":
        manifest_key = await asyncio.to_thread(aws_live.find_harvested_manifest_key, vod["bucket"], vod["path"])
    if manifest_key and video:
        base = settings.BACKEND_PUBLIC_URL.rstrip("/")
        prefix = settings.API_V1_PREFIX.strip("/")
        video.hls_manifest_key = manifest_key
        video.hls_url = f"{base}/{prefix}/media/stream/{video.id}/manifest.m3u8"
        video.transcode_status = "complete"
        video.transcode_progress = 100
        vod["status"] = "complete"
        vod["manifest_key"] = manifest_key
    else:
        if video:
            video.transcode_status = "failed"
        vod["status"] = "failed"
        vod["error"] = (error or f"Harvest ended with status {status}")[:300]
        logger.warning("Live VOD export failed for %s: %s", state.get("name"), vod["error"])
    return {**state, "vod": vod}


# ─── Reconciliation ─────────────────────────────────────────────────────────

async def _auto_stop_if_idle(stream: LiveStream, state: dict) -> dict:
    """MediaLive bills while RUNNING even with no encoder; stop channels that have had no input for too long."""
    limit = settings.LIVE_AUTO_STOP_IDLE_MINUTES
    now = _now()
    checked = state.get("input_checked_at")
    if limit <= 0 or (checked and (now - datetime.fromisoformat(checked)).total_seconds() < INPUT_CHECK_INTERVAL):
        return state
    state = {**state, "input_checked_at": _iso(now)}
    has_input = await asyncio.to_thread(aws_live.has_recent_input, state)
    if has_input:
        return {**state, "last_input_at": _iso(now)}
    if has_input is None:
        return state
    idle_since = datetime.fromisoformat(state.get("last_input_at") or state.get("broadcast_started_at") or _iso(now))
    if now - idle_since < timedelta(minutes=limit):
        return state
    try:
        await asyncio.to_thread(aws_live.stop_channel, state)
    except aws_live.LiveAwsError:
        logger.exception("Auto-stop failed for stream %s", stream.id)
        return state
    logger.warning("Auto-stopped stream %s: no encoder input for %d min", stream.id, limit)
    stream.is_live = False
    return {**state, "channel_state": "STOPPING"}


PROVISIONING_TIMEOUT = timedelta(minutes=10)


async def _fail_stale_provisioning() -> None:
    """Provisioning runs in-process; a restart mid-way would leave the card spinning forever."""
    async with AsyncSessionLocal() as db:
        stale = (await db.execute(
            select(LiveStream)
            .where(
                LiveStream.aws_live["status"].astext == "provisioning",
                LiveStream.updated_at < _now() - PROVISIONING_TIMEOUT,
            )
            .with_for_update(skip_locked=True)
        )).scalars().all()
        for stream in stale:
            stream.aws_live = {
                **(stream.aws_live or {}),
                "status": "error",
                "error": "Setup was interrupted (for example by a server restart). Press Retry setup.",
            }
        if stale:
            await db.commit()

async def _reconcile_stream(stream_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        loaded = await _load(db, stream_id, lock=True)  # skip rows another worker is handling
        if not loaded:
            return
        stream, client_slug = loaded
        state = dict(stream.aws_live or {})

        if state.get("channel_state") in _ACTIVE_STATES:
            observed = await asyncio.to_thread(aws_live.describe_channel_state, state)
            if observed != state["channel_state"]:
                now = _now()
                state["channel_state"] = observed
                stream.stream_status = "live" if observed in _LIVE_STATES else "idle"
                if observed == "RUNNING" and not state.get("broadcast_started_at"):
                    state["broadcast_started_at"] = _iso(now - timedelta(seconds=POLL_INTERVAL))
                elif observed == "IDLE":
                    state.pop("last_input_at", None)
                    state.pop("input_checked_at", None)
                    started = state.pop("broadcast_started_at", None)
                    if started and (state.get("options") or {}).get("record_vod"):
                        try:
                            state = await start_vod_export(
                                db, stream, state, client_slug, datetime.fromisoformat(started), now
                            )
                        except Exception as exc:
                            logger.exception("Could not start VOD export for stream %s", stream_id)
                            state["vod"] = {"status": "failed", "error": str(exc)[:300]}

            if state.get("channel_state") == "RUNNING":
                state = await _auto_stop_if_idle(stream, state)

        if (state.get("vod") or {}).get("status") == "harvesting":
            state = await _finish_harvest(db, state)

        stream.aws_live = state
        await db.commit()


async def reconcile_once() -> None:
    await _fail_stale_provisioning()
    async with AsyncSessionLocal() as db:
        ids = (await db.execute(
            select(LiveStream.id).where(
                LiveStream.aws_live["status"].astext == "ready",
                or_(
                    LiveStream.aws_live["channel_state"].astext.in_(sorted(_ACTIVE_STATES)),
                    LiveStream.aws_live["vod"]["status"].astext == "harvesting",
                ),
            )
        )).scalars().all()
    for stream_id in ids:
        try:
            await _reconcile_stream(stream_id)
        except Exception:
            logger.exception("Live reconcile failed for stream %s", stream_id)


async def run_live_poller() -> None:
    logger.info("LivePoller started (interval=%ds)", POLL_INTERVAL)
    while True:
        try:
            await reconcile_once()
        except Exception:
            logger.exception("LivePoller sweep error")
        await asyncio.sleep(POLL_INTERVAL)
