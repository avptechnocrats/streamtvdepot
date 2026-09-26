"""
Transcode status poller — asyncio background task.

Runs every POLL_INTERVAL seconds, queries all active MediaConvert jobs
from the transcode_jobs table, calls AWS GetJob, and syncs status back
to both transcode_jobs and content_videos.

This replaces the need for an inbound webhook in local dev, and acts as a
safety net in production if webhooks are delayed or missed.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.mediaconvert import get_job_status, hls_manifest_s3_key, hls_manifest_url, invalidate_cloudfront_hls
from app.models.client.content import TranscodeJob, Video

logger = logging.getLogger(__name__)

POLL_INTERVAL = 30  # seconds between sweeps


async def _poll_once() -> None:
    """Single sweep: sync all pending/processing jobs from MediaConvert → DB."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(TranscodeJob).where(
                TranscodeJob.status.in_(["pending", "processing"]),
                TranscodeJob.mediaconvert_job_id.isnot(None),
            )
        )
        active_jobs = result.scalars().all()

        if not active_jobs:
            return

        logger.debug("Polling %d active MediaConvert job(s)", len(active_jobs))
        loop = asyncio.get_event_loop()

        for job_row in active_jobs:
            try:
                info = await loop.run_in_executor(
                    None,
                    lambda jid=job_row.mediaconvert_job_id: get_job_status(jid),
                )
                mc_status: str = info["status"]  # SUBMITTED / PROGRESSING / COMPLETE / ERROR / CANCELED
                progress: int = info.get("progress", 0)
                error_msg: str | None = info.get("error_message")
                now = datetime.now(timezone.utc)

                vid_result = await db.execute(
                    select(Video).where(Video.id == job_row.video_id)
                )
                video = vid_result.scalar_one_or_none()

                if mc_status == "COMPLETE":
                    # Parse client_slug from output_s3_prefix:
                    # stored as: s3://bucket/hls/client_slug/video_id/video_id  (no trailing slash)
                    # Strip scheme + bucket then split on /
                    # e.g. "s3://streamtvdepot/hls/kalingo-tv/uuid/uuid" → ["hls","kalingo-tv","uuid","uuid"]
                    raw_prefix = (job_row.output_s3_prefix or "").rstrip("/")
                    # Remove s3://bucket/ prefix if present
                    if raw_prefix.startswith("s3://"):
                        raw_prefix = raw_prefix.split("/", 3)[-1]  # drop "s3://bucket"
                    parts = raw_prefix.split("/")
                    # parts: ["hls", "client_slug", "video_id", "video_id"]
                    # client_slug is at index 1 (after the output prefix "hls")
                    client_slug = parts[1] if len(parts) >= 3 else str(job_row.client_id)
                    video_id_str = str(job_row.video_id)

                    final_hls_url = hls_manifest_url(client_slug, video_id_str)
                    final_hls_key = hls_manifest_s3_key(client_slug, video_id_str)

                    job_row.status = "complete"
                    job_row.progress = 100
                    job_row.hls_url = final_hls_url
                    job_row.completed_at = now

                    if video:
                        video.transcode_status = "complete"
                        video.transcode_progress = 100
                        video.hls_url = final_hls_url
                        video.hls_manifest_key = final_hls_key

                    logger.info(
                        "Poller: job %s COMPLETE → video %s",
                        job_row.mediaconvert_job_id, job_row.video_id,
                    )

                    # Evict stale CloudFront cache so the new segments
                    # (encrypted with the new DRM key) are served immediately.
                    await loop.run_in_executor(
                        None,
                        lambda cs=client_slug, vid=video_id_str: invalidate_cloudfront_hls(cs, vid),
                    )

                elif mc_status in ("ERROR", "CANCELED"):
                    job_row.status = "failed" if mc_status == "ERROR" else "canceled"
                    job_row.error_message = error_msg or mc_status
                    job_row.completed_at = now

                    if video:
                        video.transcode_status = "failed"
                        video.transcode_job_id = f"error:{error_msg or mc_status}"

                    logger.warning(
                        "Poller: job %s %s → video %s: %s",
                        job_row.mediaconvert_job_id, mc_status, job_row.video_id, error_msg,
                    )

                else:
                    # SUBMITTED / PROGRESSING — update progress only
                    job_row.status = "processing"
                    job_row.progress = progress
                    if not job_row.started_at and mc_status == "PROGRESSING":
                        job_row.started_at = now

                    if video:
                        video.transcode_status = "processing"
                        video.transcode_progress = progress

                await db.commit()

            except Exception as exc:
                logger.error(
                    "Poller: error syncing job %s: %s",
                    job_row.mediaconvert_job_id, exc,
                )


async def run_poller() -> None:
    """
    Long-running asyncio task registered in FastAPI lifespan.
    Polls on startup then every POLL_INTERVAL seconds.
    """
    logger.info("TranscodePoller started (interval=%ds)", POLL_INTERVAL)
    while True:
        try:
            await _poll_once()
        except Exception as exc:
            logger.error("TranscodePoller sweep error: %s", exc)
        await asyncio.sleep(POLL_INTERVAL)
