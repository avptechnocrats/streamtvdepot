"""
Admin – Transcoding API.

Endpoints:
  POST  /admin/transcoding/videos/{video_id}/trigger
        Trigger ABR HLS transcoding for an already-uploaded video.
        Generates an AES-128 DRM key and submits a MediaConvert job.

  GET   /admin/transcoding/videos/{video_id}/status
        Poll the current transcode_status / progress from the DB.
        (MediaConvert webhooks update the DB; polling is only for the
         admin UI – no need to call AWS on every poll.)

  POST  /admin/transcoding/webhook
        Receives AWS EventBridge / SNS notifications from MediaConvert.
        Used to update transcode_status and hls_url on job completion.
        Secure this endpoint: verify the SNS signature or configure an
        API-Gateway authoriser in front of it.

Frontend usage pattern:
  1. Admin uploads raw video → receives s3_key via /upload/confirm.
  2. Admin calls POST /trigger → receives job_id immediately.
  3. Admin polls GET /status every ~5 s until status == "complete".
  4. Frontend player reads video.hls_url for playback.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.dependencies import get_current_client_admin
from app.core.drm import (
    create_key_access_token,
    decrypt_key,
    encrypt_key,
    generate_aes128_key,
    key_as_hex,
)
from app.core.mediaconvert import (
    create_hls_job,
    get_job_status,
    hls_manifest_s3_key,
    hls_manifest_url,
    invalidate_cloudfront_hls,
)
from app.models.client.content import Video, TranscodeJob

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── Pydantic responses ────────────────────────────────────────────────────────

class TriggerResponse(BaseModel):
    video_id: str
    transcode_job_id: str
    transcode_status: str
    drm_enabled: bool
    message: str


class StatusResponse(BaseModel):
    video_id: str
    transcode_status: str | None
    transcode_progress: int | None
    hls_url: str | None
    drm_enabled: bool
    error_message: str | None = None


class KeyTokenResponse(BaseModel):
    token: str
    video_id: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_video_for_client(video_id: str, client_id: uuid.UUID, db: AsyncSession) -> Video:
    result = await db.execute(
        select(Video).where(
            Video.id == uuid.UUID(video_id),
            Video.client_id == client_id,
            Video.deleted_at.is_(None),
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")
    return video


def _drm_key_url(video_id: str) -> str:
    """Build the AES-128 key URI that MediaConvert bakes into #EXT-X-KEY."""
    base = settings.DRM_KEY_DELIVERY_BASE_URL.rstrip("/")
    return f"{base}/{video_id}"


def _check_mediaconvert_config() -> None:
    """
    Raise HTTPException 503 if the minimum required AWS credentials are absent.
    MEDIACONVERT_ENDPOINT is optional (auto-discovered via describe_endpoints).
    MEDIACONVERT_ROLE_ARN is required; it cannot be guessed safely.
    """
    missing = []
    if not settings.AWS_ACCESS_KEY_ID:
        missing.append("AWS_ACCESS_KEY_ID")
    if not settings.AWS_SECRET_ACCESS_KEY:
        missing.append("AWS_SECRET_ACCESS_KEY")
    if not settings.MEDIACONVERT_ROLE_ARN:
        missing.append("MEDIACONVERT_ROLE_ARN")
    if not settings.DRM_FERNET_KEY:
        missing.append("DRM_FERNET_KEY")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"MediaConvert is not configured. Missing env vars: {', '.join(missing)}",
        )


async def _submit_mediaconvert_job(
    video_id: str,
    client_id: str,
    job_row_id: str,
    s3_key: str,
    client_slug: str,
    drm_enabled: bool,
) -> None:
    """
    Background task: submit a MediaConvert job, update the Video row,
    and write a full audit record to transcode_jobs.
    Opens its own DB session — the request session is already closed by the time
    FastAPI runs background tasks.
    """
    loop = asyncio.get_event_loop()
    async with AsyncSessionLocal() as db:
        try:
            drm_key_hex: str | None = None
            drm_key_url: str | None = None
            encrypted_key: str | None = None

            if drm_enabled:
                raw_key = generate_aes128_key()
                drm_key_hex = key_as_hex(raw_key)
                drm_key_url = _drm_key_url(video_id)
                encrypted_key = encrypt_key(raw_key)

            # boto3 is synchronous – run in thread pool to avoid blocking the event loop
            job_id = await loop.run_in_executor(
                None,
                lambda: create_hls_job(
                    input_s3_key=s3_key,
                    client_slug=client_slug,
                    video_id=video_id,
                    drm_key_hex=drm_key_hex,
                    drm_key_url=drm_key_url,
                ),
            )

            now = datetime.now(timezone.utc)

            # Update Video row
            result = await db.execute(select(Video).where(Video.id == uuid.UUID(video_id)))
            video = result.scalar_one_or_none()
            if video:
                video.transcode_job_id = job_id
                video.transcode_status = "processing"
                video.transcode_progress = 0
                if encrypted_key:
                    video.drm_key_encrypted = encrypted_key

            # Update TranscodeJob row
            result = await db.execute(
                select(TranscodeJob).where(TranscodeJob.id == uuid.UUID(job_row_id))
            )
            job_row = result.scalar_one_or_none()
            if job_row:
                job_row.mediaconvert_job_id = job_id
                job_row.mediaconvert_queue = settings.MEDIACONVERT_QUEUE_ARN
                job_row.status = "processing"
                job_row.submitted_at = now

            await db.commit()
            logger.info("MediaConvert job %s submitted for video %s", job_id, video_id)

        except Exception as exc:
            error_detail = str(exc)
            logger.error("MediaConvert job submission failed for video %s: %s", video_id, exc)
            try:
                now = datetime.now(timezone.utc)

                result = await db.execute(select(Video).where(Video.id == uuid.UUID(video_id)))
                video = result.scalar_one_or_none()
                if video:
                    video.transcode_status = "failed"
                    video.transcode_job_id = f"error:{error_detail[:240]}"

                result = await db.execute(
                    select(TranscodeJob).where(TranscodeJob.id == uuid.UUID(job_row_id))
                )
                job_row = result.scalar_one_or_none()
                if job_row:
                    job_row.status = "failed"
                    job_row.error_message = error_detail
                    job_row.completed_at = now

                await db.commit()
            except Exception as inner_exc:
                logger.error("Failed to persist error state for video %s: %s", video_id, inner_exc)


# ─── POST /trigger ─────────────────────────────────────────────────────────────

class TriggerRequest(BaseModel):
    enable_drm: bool = True


@router.post("/videos/{video_id}/trigger", response_model=TriggerResponse)
async def trigger_transcode(
    video_id: str,
    payload: TriggerRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """
    Trigger ABR HLS transcoding for a video.

    The video must already have a raw ``video_url`` set (uploaded to S3).
    The job runs in the background; poll GET /status to track progress.
    """
    _check_mediaconvert_config()

    video = await _get_video_for_client(video_id, admin._client_id, db)

    if not video.video_url:
        raise HTTPException(
            status_code=400,
            detail="Video has no source file. Upload a raw video first.",
        )

    # Derive the S3 key from the stored URL
    # URL format: https://{bucket}.s3.{region}.amazonaws.com/{key}
    try:
        from urllib.parse import urlparse
        s3_key = urlparse(video.video_url).path.lstrip("/")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse video_url into S3 key.")

    if not s3_key:
        raise HTTPException(status_code=400, detail="Could not derive S3 key from video_url.")

    # Mark as pending immediately so the UI can start polling
    video.transcode_status = "pending"
    video.transcode_progress = 0

    client_slug = getattr(admin, "_client_slug", "") or str(admin._client_id)
    from app.core.mediaconvert import _hls_output_destination
    output_prefix = _hls_output_destination(client_slug, video_id)

    # Reuse the most recent job row for this video (e.g. on retry after failure)
    # rather than creating a new row every time the button is clicked.
    existing = await db.execute(
        select(TranscodeJob)
        .where(TranscodeJob.video_id == uuid.UUID(video_id))
        .order_by(TranscodeJob.created_at.desc())
        .limit(1)
    )
    job_row = existing.scalar_one_or_none()

    if job_row:
        job_row.status = "pending"
        job_row.mediaconvert_job_id = None
        job_row.mediaconvert_queue = None
        job_row.hls_url = None
        job_row.progress = 0
        job_row.error_code = None
        job_row.error_message = None
        job_row.submitted_at = None
        job_row.started_at = None
        job_row.completed_at = None
        job_row.input_s3_key = s3_key
        job_row.output_s3_prefix = output_prefix
        job_row.drm_enabled = payload.enable_drm
    else:
        job_row = TranscodeJob(
            client_id=admin._client_id,
            video_id=uuid.UUID(video_id),
            input_s3_key=s3_key,
            output_s3_prefix=output_prefix,
            status="pending",
            drm_enabled=payload.enable_drm,
        )
        db.add(job_row)

    await db.commit()
    await db.refresh(job_row)

    # Run the actual AWS call in the background (avoids blocking the HTTP response)
    background_tasks.add_task(
        _submit_mediaconvert_job,
        video_id=video_id,
        client_id=str(admin._client_id),
        job_row_id=str(job_row.id),
        s3_key=s3_key,
        client_slug=client_slug,
        drm_enabled=payload.enable_drm,
    )

    return TriggerResponse(
        video_id=video_id,
        transcode_job_id="pending",
        transcode_status="pending",
        drm_enabled=payload.enable_drm,
        message="Transcoding job queued. Poll /status for progress.",
    )


# ─── GET /status ───────────────────────────────────────────────────────────────

@router.get("/videos/{video_id}/status", response_model=StatusResponse)
async def get_transcode_status(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Return the current transcode status stored in the DB."""
    video = await _get_video_for_client(video_id, admin._client_id, db)

    # If transcode_job_id starts with "error:" it's a stored failure reason, not a real job ID
    error_message: str | None = None
    if video.transcode_status == "failed" and video.transcode_job_id and video.transcode_job_id.startswith("error:"):
        error_message = video.transcode_job_id[len("error:"):]

    return StatusResponse(
        video_id=video_id,
        transcode_status=video.transcode_status,
        transcode_progress=video.transcode_progress,
        hls_url=video.hls_url,
        drm_enabled=bool(video.drm_key_encrypted),
        error_message=error_message,
    )


# ─── GET /key-token ────────────────────────────────────────────────────────────

@router.get("/videos/{video_id}/key-token", response_model=KeyTokenResponse)
async def get_drm_key_token(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """
    Issue a short-lived JWT that authorises the player to fetch the AES-128
    decryption key from /api/v1/drm/key/{video_id}, and/or to access the
    /api/v1/media/stream manifest proxy for non-free videos.

    Call this immediately before initialising the player with an HLS URL.
    """
    video = await _get_video_for_client(video_id, admin._client_id, db)

    # No authorization token is needed at all for free, non-DRM videos.
    if not video.drm_key_encrypted and video.access_type == "free":
        raise HTTPException(status_code=404, detail="This video does not require a playback token.")

    token = create_key_access_token(
        video_id=video_id,
        user_id=str(admin.id),
    )
    return KeyTokenResponse(token=token, video_id=video_id)


# ─── POST /webhook (MediaConvert EventBridge / SNS callback) ──────────────────

@router.post("/webhook", include_in_schema=False)
async def mediaconvert_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_amz_sns_message_type: str | None = Header(None),
):
    """
    Receives AWS EventBridge or SNS MediaConvert job state-change events.

    For SNS:
      Set this URL as the HTTPS subscription endpoint for the SNS topic
      that MediaConvert publishes to.  The first call will be a
      SubscriptionConfirmation message that you must confirm.

    For EventBridge:
      Point an EventBridge rule for MediaConvert job state changes
      at an API-Gateway HTTP target that forwards to this URL.

    Security note:
      In production, validate the SNS signature on every message or
      restrict this endpoint via an API-Gateway authoriser / VPC.
    """
    raw_body = await request.body()
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    # ── SNS subscription confirmation ─────────────────────────────────────────
    if x_amz_sns_message_type == "SubscriptionConfirmation":
        confirm_url = event.get("SubscribeURL")
        if confirm_url and confirm_url.startswith("https://sns."):
            async with httpx.AsyncClient() as http:
                await http.get(confirm_url)
        return {"confirmed": True}

    # ── SNS notification wrapping EventBridge event ───────────────────────────
    if x_amz_sns_message_type == "Notification":
        try:
            event = json.loads(event.get("Message", "{}"))
        except (json.JSONDecodeError, TypeError):
            pass

    # ── Parse EventBridge MediaConvert state-change event ────────────────────
    detail = event.get("detail", {})
    job_id: str | None = detail.get("jobId")
    mc_status: str | None = detail.get("status")       # COMPLETE / ERROR / CANCELED
    progress: int = detail.get("jobProgress", {}).get("jobPercentComplete", 0)
    user_meta: dict = detail.get("userMetadata", {})
    video_id_str: str | None = user_meta.get("video_id")

    if not job_id or not video_id_str:
        # Not a MediaConvert event we care about
        return {"ignored": True}

    try:
        video_uuid = uuid.UUID(video_id_str)
    except ValueError:
        return {"ignored": True}

    result = await db.execute(
        select(Video).where(Video.id == video_uuid, Video.transcode_job_id == job_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        return {"ignored": True}

    # Also fetch the matching TranscodeJob row for the audit log
    job_result = await db.execute(
        select(TranscodeJob).where(
            TranscodeJob.video_id == video_uuid,
            TranscodeJob.mediaconvert_job_id == job_id,
        )
    )
    job_row = job_result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if mc_status == "COMPLETE":
        client_slug = user_meta.get("client_slug", str(video.client_id))
        video.transcode_status = "complete"
        video.transcode_progress = 100
        video.hls_manifest_key = hls_manifest_s3_key(client_slug, video_id_str)
        video.hls_url = hls_manifest_url(client_slug, video_id_str)
        if job_row:
            job_row.status = "complete"
            job_row.progress = 100
            job_row.hls_url = video.hls_url
            job_row.completed_at = now
    elif mc_status == "ERROR":
        error_msg = detail.get("errorMessage") or detail.get("errorCode") or "Unknown error"
        video.transcode_status = "failed"
        video.transcode_progress = progress
        video.transcode_job_id = f"error:{error_msg[:240]}"
        if job_row:
            job_row.status = "failed"
            job_row.error_code = detail.get("errorCode")
            job_row.error_message = detail.get("errorMessage") or error_msg
            job_row.completed_at = now
    elif mc_status == "CANCELED":
        video.transcode_status = "failed"
        if job_row:
            job_row.status = "canceled"
            job_row.completed_at = now
    else:
        # PROGRESSING / SUBMITTED – just update progress
        video.transcode_status = "processing"
        video.transcode_progress = progress
        if job_row:
            job_row.status = "processing"
            job_row.progress = progress
            if not job_row.started_at:
                job_row.started_at = now

    await db.commit()
    logger.info("Webhook: job %s → status %s (video %s)", job_id, mc_status, video_id_str)

    # Invalidate CloudFront cache when a new HLS package is ready so that
    # stale segments (encrypted with the previous DRM key) are not served.
    if mc_status == "COMPLETE":
        client_slug = user_meta.get("client_slug", str(video.client_id))
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: invalidate_cloudfront_hls(client_slug, video_id_str),
        )

    return {"ok": True}
