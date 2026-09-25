"""
RTMP Callbacks
──────────────
Nginx-RTMP fires these HTTP callbacks when a stream starts/stops.
The `on_publish` handler validates the stream key, marks the channel live,
and starts an internal recorder that saves the live feed as MP4.
The `on_publish_done` handler marks it idle when OBS/encoder disconnects and
stops the recorder.

The `/hls-auth` endpoint is called by the main nginx via `auth_request` before
serving any HLS segment or playlist. It returns 200 if the channel is active
and 403 if the channel has been disabled by the admin.

Nginx-RTMP config snippet:
    application live {
        on_publish  http://backend:8000/api/v1/rtmp/on-publish;
        on_publish_done http://backend:8000/api/v1/rtmp/on-publish-done;
    }

Nginx-RTMP expects 2xx → allow, 4xx/5xx → deny the stream.
"""

import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.core.rtmp_recording import get_recording_path, start_recording, stop_recording
from app.core.storage import presign_get_url
from app.models.client.content import LiveStream

logger = logging.getLogger(__name__)

router = APIRouter(tags=["RTMP Callbacks"])

# Matches /hls/<rtmp_key>[_quality][_segment][.ext]
# e.g. /hls/sports-live-abc_xYz_480p-0.ts  or  /hls/sports-live-abc_xYz.m3u8
# Uses non-greedy .+? so quality suffix (_720p/_480p/_360p) is NOT included in group 1.
_HLS_KEY_RE = re.compile(r"/hls/(.+?)(?:_(?:720p|480p|360p))?(?:-\d+)?\.(?:m3u8|ts)$")


@router.post("/on-publish")
async def on_publish(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Called by Nginx-RTMP when an encoder starts publishing.
    Validates the stream key, checks the channel is active, and marks it live."""
    form = await request.form()
    # nginx-rtmp can append ?query params to name — strip them
    name = str(form.get("name", "")).split("?")[0].strip()
    app  = str(form.get("app",  "")).strip()

    logger.info("RTMP on_publish: app=%r name=%r", app, name)

    # Only validate streams on the 'live' application (ignore internal FFmpeg feeds)
    if app != "live":
        logger.info("RTMP on_publish: ignoring app=%r", app)
        return {"status": "ok"}

    result = await db.execute(
        select(LiveStream).where(LiveStream.rtmp_key == name)
    )
    stream = result.scalar_one_or_none()
    if not stream:
        logger.warning("RTMP on_publish: invalid stream key %r — denying", name)
        raise HTTPException(status_code=403, detail="Invalid stream key")

    if not stream.is_active:
        logger.warning("RTMP on_publish: channel %r is disabled — denying", name)
        raise HTTPException(status_code=403, detail="Channel is disabled")

    # Only update stream_status (technical state). is_live is controlled
    # exclusively by the admin ON/OFF toggle — do not override it here.
    stream.stream_status = "live"
    await db.flush()
    await start_recording(stream, db)
    logger.info("RTMP on_publish: stream %r connected", name)
    return {"status": "ok"}


@router.get("/hls-auth")
async def hls_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Called internally by nginx auth_request before serving HLS files.

    Nginx passes the original request URI via the X-Original-URI header.
    Returns 200 if the channel is active, 403 if disabled, 404 if unknown.
    """
    original_uri = request.headers.get("X-Original-URI", "")
    match = _HLS_KEY_RE.search(original_uri)
    if not match:
        # Cannot determine stream key — allow pass-through (e.g. OPTIONS)
        return {"status": "ok"}

    rtmp_key = match.group(1)
    result = await db.execute(
        select(LiveStream.is_active, LiveStream.is_live).where(LiveStream.rtmp_key == rtmp_key)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Stream not found")
    if not row.is_active:
        logger.info("HLS auth: channel %r is inactive — blocking", rtmp_key)
        raise HTTPException(status_code=403, detail="Channel is disabled")
    if not row.is_live:
        logger.info("HLS auth: channel %r is turned OFF — blocking", rtmp_key)
        raise HTTPException(status_code=403, detail="Channel is off")
    return {"status": "ok"}


@router.post("/on-publish-done")
async def on_publish_done(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Called by Nginx-RTMP when an encoder stops publishing."""
    form = await request.form()
    name = str(form.get("name", "")).split("?")[0].strip()
    app  = str(form.get("app",  "")).strip()

    logger.info("RTMP on_publish_done: app=%r name=%r", app, name)

    if app != "live":
        return {"status": "ok"}

    result = await db.execute(
        select(LiveStream).where(LiveStream.rtmp_key == name)
    )
    stream = result.scalar_one_or_none()
    if stream:
        # Only update stream_status. is_live remains under admin control.
        stream.stream_status = "idle"
        if stream.recording_status == "recording":
            stream.recording_status = "processing"
        await db.flush()
        await stop_recording(stream.id)
        logger.info("RTMP on_publish_done: stream %r disconnected", name)
    return {"status": "ok"}


@router.get("/recordings/{filename}")
async def download_recording(filename: str):
    """Redirect to a fresh S3 presigned URL for a finished live-stream recording."""
    safe_name = Path(filename).name
    recording_path = get_recording_path(safe_name)
    if recording_path.exists():
        raise HTTPException(status_code=409, detail="Recording is still being finalized")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(LiveStream.recording_s3_key).where(LiveStream.recording_filename == safe_name)
        )
        row = result.first()
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="Recording not found")
        url = presign_get_url(row[0], original_filename=safe_name, inline=True)
        if not url:
            raise HTTPException(status_code=502, detail="Unable to generate recording URL")
        return RedirectResponse(url=url, status_code=302)
