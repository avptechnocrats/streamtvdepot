import asyncio
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlsplit

from fastapi import HTTPException
from sqlalchemy import case, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.mediaconvert import _hls_output_destination, get_job_status, hls_manifest_s3_key, hls_manifest_url
from app.models.client.content import ContentStatus, Episode, MediaAsset, MediaAssetRendition, Series, TranscodeJob, Video

logger = logging.getLogger(__name__)
LIBRARY_PROFILE = "abr_hls_v1_drm"
EPISODE_PROFILE = LIBRARY_PROFILE
LEGACY_EPISODE_PROFILE = "abr_hls_v1_clear"
EPISODE_PLAYBACK_PROFILES = (EPISODE_PROFILE, LEGACY_EPISODE_PROFILE)


async def reusable_episode_rendition(db: AsyncSession, client_id, source_key: str) -> MediaAssetRendition | None:
    return await db.scalar(select(MediaAssetRendition).where(
        MediaAssetRendition.client_id == client_id,
        MediaAssetRendition.source_s3_key == source_key,
        or_(
            MediaAssetRendition.profile == LIBRARY_PROFILE,
            (MediaAssetRendition.profile == LEGACY_EPISODE_PROFILE)
            & (MediaAssetRendition.status == "complete")
            & MediaAssetRendition.hls_manifest_key.is_not(None),
        ),
    ).order_by(case((MediaAssetRendition.profile == LIBRARY_PROFILE, 0), else_=1)).limit(1))


async def prepare_media_asset_transcode(
    db: AsyncSession, asset: MediaAsset, *, profile: str = LIBRARY_PROFILE, retry: bool = False,
) -> MediaAssetRendition | None:
    if not asset.content_type or not asset.content_type.startswith("video/"):
        return None
    created = (await db.execute(insert(MediaAssetRendition).values(
        client_id=asset.client_id, media_asset_id=asset.id, source_s3_key=asset.s3_key,
        profile=profile, status="pending", progress=0,
    ).on_conflict_do_nothing(constraint="uq_media_asset_rendition_source_profile").returning(MediaAssetRendition.id))).scalar_one_or_none()
    rendition = await db.scalar(select(MediaAssetRendition).where(
        MediaAssetRendition.client_id == asset.client_id,
        MediaAssetRendition.source_s3_key == asset.s3_key, MediaAssetRendition.profile == profile,
    ).with_for_update())
    rendition.media_asset_id = asset.id
    if rendition.status == "complete" and rendition.hls_manifest_key:
        return rendition
    if not created and rendition.status in {"pending", "processing"}:
        return rendition
    if not created and rendition.status == "failed" and not retry:
        return rendition
    from app.api.v1.admin.transcoding import _check_mediaconvert_config

    rendition.status = "pending"
    rendition.progress = 0
    rendition.error_message = None
    rendition.mediaconvert_job_id = None
    rendition.hls_manifest_key = None
    rendition.hls_url = None
    rendition.drm_key_encrypted = None
    drm_enabled = profile == LIBRARY_PROFILE
    try:
        _check_mediaconvert_config(enable_drm=drm_enabled)
    except HTTPException as error:
        rendition.status = "failed"
        rendition.error_message = str(error.detail)
        return rendition
    db.add(TranscodeJob(
        client_id=asset.client_id, video_id=None, media_asset_rendition_id=rendition.id,
        input_s3_key=asset.s3_key,
        output_s3_prefix=_hls_output_destination(asset.s3_key.split("/", 1)[0], str(rendition.id)),
        status="pending", progress=0, drm_enabled=drm_enabled,
    ))
    return rendition


def series_readiness_filters() -> list:
    ready = select(MediaAssetRendition.id).where(
        MediaAssetRendition.id == Episode.media_asset_rendition_id,
        MediaAssetRendition.client_id == Episode.client_id,
        MediaAssetRendition.status == "complete", MediaAssetRendition.hls_manifest_key.is_not(None),
    ).correlate(Episode).exists()
    published = select(Episode.id).where(
        Episode.series_id == Series.id, Episode.client_id == Series.client_id,
        Episode.status == ContentStatus.PUBLISHED,
    ).correlate(Series)
    return [published.exists(), ~published.where(~ready).exists()]


def episode_stream_url(episode: Episode, user_id: str, *, preview: bool = False, expires_at: str | None = None) -> str:
    from app.core.config import settings
    from app.core.drm import create_key_access_token

    if not episode.stream_ready:
        raise HTTPException(status_code=409, detail="Episode transcoding is not ready")
    purpose = "episode-preview" if preview else "episode"
    expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00")) if expires_at else None
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    token = create_key_access_token(
        video_id=f"{purpose}:{episode.id}:{episode.media_asset_rendition_id}", user_id=user_id,
        expires_at=expiry,
    )
    base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    prefix = settings.API_V1_PREFIX.strip("/")
    return f"{base}/{prefix}/media/stream/episode/{episode.id}/manifest.m3u8?token={token}"


async def prepare_episode_transcode(db: AsyncSession, episode: Episode, *, retry: bool = False) -> None:
    if not episode.video_url:
        episode.media_asset_rendition_id = None
        episode.rendition = None
        return
    source_key = unquote(urlsplit(episode.video_url).path.lstrip("/"))
    asset = await db.scalar(select(MediaAsset).where(
        MediaAsset.client_id == episode.client_id, MediaAsset.s3_key == source_key,
        MediaAsset.content_type.like("video/%"),
    ))
    if not asset:
        raise HTTPException(status_code=422, detail="Episode videos must be uploaded or selected from this tenant's Media Library")
    existing = episode.rendition
    if (
        existing and existing.client_id == episode.client_id
        and existing.source_s3_key == source_key
        and existing.profile in EPISODE_PLAYBACK_PROFILES
        and existing.status in {"complete", "pending", "processing"}
        and (existing.status != "complete" or existing.hls_manifest_key)
    ):
        episode.video_url = asset.url
        return
    rendition = await reusable_episode_rendition(db, episode.client_id, source_key)
    if not rendition or rendition.status not in {"complete", "pending", "processing"} or (rendition.status == "complete" and not rendition.hls_manifest_key):
        rendition = await prepare_media_asset_transcode(db, asset, profile=EPISODE_PROFILE, retry=retry)
    if not rendition:
        raise HTTPException(status_code=422, detail="Episode source must be a video asset")
    episode.media_asset_rendition_id = rendition.id
    episode.rendition = rendition
    episode.video_url = asset.url


async def require_publishable_series(db: AsyncSession, series) -> None:
    await db.flush()
    result = await db.execute(select(Episode).where(
        Episode.series_id == series.id, Episode.client_id == series.client_id,
        Episode.status == ContentStatus.PUBLISHED,
    ))
    episodes = list(result.scalars().all())
    if not episodes:
        raise HTTPException(status_code=409, detail="Publish at least one ready episode before publishing this series")
    if any(not episode.stream_ready for episode in episodes):
        raise HTTPException(status_code=409, detail="Wait for every published episode's media asset to finish transcoding before publishing the series")


async def process_episode_transcodes() -> None:
    from app.api.v1.admin.transcoding import _submit_mediaconvert_job

    stale = datetime.now(timezone.utc) - timedelta(minutes=5)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(TranscodeJob, MediaAssetRendition).join(
            MediaAssetRendition, TranscodeJob.media_asset_rendition_id == MediaAssetRendition.id,
        ).where(
            TranscodeJob.video_id.is_(None), MediaAssetRendition.profile.in_(EPISODE_PLAYBACK_PROFILES),
            or_(TranscodeJob.status == "pending", (TranscodeJob.status == "submitting") & (TranscodeJob.updated_at < stale)),
        ).order_by(TranscodeJob.created_at).limit(10).with_for_update(skip_locked=True, of=TranscodeJob))).all()
        submissions = []
        for job, rendition in rows:
            if rendition.status not in {"pending", "processing"}:
                job.status = "canceled"
                continue
            job.status = "submitting"
            job.updated_at = datetime.now(timezone.utc)
            submissions.append((str(job.id), str(job.client_id), rendition.source_s3_key, str(rendition.id), rendition.profile, job.drm_enabled))
        await db.commit()
    for job_id, client_id, source_key, rendition_id, profile, drm_enabled in submissions:
        await _submit_mediaconvert_job(
            video_id=None, client_id=client_id, job_row_id=job_id, s3_key=source_key,
            client_slug=source_key.split("/", 1)[0], drm_enabled=drm_enabled,
            asset_rendition_id=rendition_id, profile=profile,
        )
    await reconcile_episode_transcodes()


async def reconcile_episode_transcodes() -> None:
    async with AsyncSessionLocal() as db:
        jobs = (await db.execute(select(TranscodeJob.id, TranscodeJob.mediaconvert_job_id).where(
            TranscodeJob.video_id.is_(None), TranscodeJob.status == "processing",
            TranscodeJob.mediaconvert_job_id.is_not(None),
        ).order_by(TranscodeJob.updated_at).limit(25))).all()
    for job_id, aws_id in jobs:
        try:
            result = await asyncio.to_thread(get_job_status, aws_id)
            async with AsyncSessionLocal() as db:
                job = await db.get(TranscodeJob, job_id, with_for_update=True)
                rendition = await db.get(MediaAssetRendition, job.media_asset_rendition_id, with_for_update=True) if job else None
                if not job or not rendition or job.status != "processing" or rendition.mediaconvert_job_id != aws_id:
                    continue
                state = result["status"]
                if rendition.status in {"complete", "failed"}:
                    continue
                if state == "COMPLETE":
                    slug = rendition.source_s3_key.split("/", 1)[0]
                    rendition.status = job.status = "complete"
                    rendition.progress = job.progress = 100
                    rendition.hls_manifest_key = hls_manifest_s3_key(slug, str(rendition.id))
                    rendition.hls_url = job.hls_url = hls_manifest_url(slug, str(rendition.id))
                    rendition.error_message = None
                    job.completed_at = datetime.now(timezone.utc)
                    await db.execute(update(Video).where(Video.media_asset_rendition_id == rendition.id).values(
                        transcode_status="complete", transcode_progress=100,
                        hls_manifest_key=rendition.hls_manifest_key, hls_url=rendition.hls_url,
                        drm_key_encrypted=rendition.drm_key_encrypted,
                    ))
                elif state in {"ERROR", "CANCELED"}:
                    rendition.status = job.status = "failed"
                    rendition.error_message = job.error_message = result.get("error_message") or "Transcoding failed"
                    job.completed_at = datetime.now(timezone.utc)
                    await db.execute(update(Video).where(Video.media_asset_rendition_id == rendition.id).values(
                        transcode_status="failed",
                    ))
                else:
                    rendition.progress = job.progress = result.get("progress", 0)
                    await db.execute(update(Video).where(Video.media_asset_rendition_id == rendition.id).values(
                        transcode_status="processing", transcode_progress=rendition.progress,
                    ))
                await db.commit()
        except Exception:
            logger.exception("Could not reconcile episode transcoding job %s", job_id)