from __future__ import annotations

import asyncio
import logging
import re
import signal
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.storage import get_s3_client
from app.models.superadmin.client import Client
from app.models.client.content import LiveStream

logger = logging.getLogger(__name__)

RECORDINGS_DIR = Path(settings.RTMP_RECORDINGS_DIR)
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

_RECORDERS: dict[uuid.UUID, asyncio.subprocess.Process] = {}
_WATCHERS: dict[uuid.UUID, asyncio.Task[None]] = {}
_LOCK = asyncio.Lock()


def _safe_slug(slug: str) -> str:
    value = re.sub(r"[^a-z0-9-]+", "-", slug.lower()).strip("-")
    return value or "stream"


def build_recording_filename(stream: LiveStream) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{_safe_slug(stream.slug)}-{stream.id}-{timestamp}.mp4"


def build_recording_url(filename: str) -> str:
    safe_filename = Path(filename).name
    return f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}/api/v1/rtmp/recordings/{quote(safe_filename)}"


def get_recording_path(filename: str) -> Path:
    return RECORDINGS_DIR / Path(filename).name


def get_recording_status_filename(stream: LiveStream) -> str:
    if stream.recording_filename:
        return Path(stream.recording_filename).name
    return build_recording_filename(stream)


def build_recording_s3_key(client_slug: str, stream: LiveStream, filename: str) -> str:
    return f"{_safe_slug(client_slug)}/live-stream-recordings/{stream.id}/{Path(filename).name}"


async def _finalize_recording(stream_id: uuid.UUID, filename: str, returncode: int) -> None:
    recording_path = get_recording_path(filename)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(LiveStream, Client.slug)
            .join(Client, Client.id == LiveStream.client_id)
            .where(LiveStream.id == stream_id)
        )
        row = result.first()
        if not row:
            return
        stream, client_slug = row

        stream.recording_completed_at = datetime.now(timezone.utc)
        if returncode == 0 and recording_path.exists() and recording_path.stat().st_size > 0:
            try:
                s3_key = build_recording_s3_key(client_slug, stream, filename)
                s3 = get_s3_client()
                extra_args = {"ContentType": "video/mp4"}
                if settings.AWS_S3_STORAGE_CLASS:
                    extra_args["StorageClass"] = settings.AWS_S3_STORAGE_CLASS
                await asyncio.to_thread(
                    s3.upload_file,
                    str(recording_path),
                    settings.AWS_S3_BUCKET,
                    s3_key,
                    ExtraArgs=extra_args,
                )
                stream.recording_s3_key = s3_key
                stream.recording_status = "ready"
                stream.recording_url = build_recording_url(filename)
                try:
                    recording_path.unlink()
                except OSError:
                    logger.warning("Could not remove local recording %s after upload", recording_path)
            except Exception:
                logger.exception("Failed to upload recording for stream %s to S3", stream_id)
                stream.recording_status = "failed"
        else:
            stream.recording_status = "failed"

        await session.commit()


async def _watch_recording(stream_id: uuid.UUID, filename: str, process: asyncio.subprocess.Process) -> None:
    try:
        returncode = await process.wait()
        await _finalize_recording(stream_id, filename, returncode)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Failed to finalize recording for stream %s", stream_id)
    finally:
        async with _LOCK:
            _RECORDERS.pop(stream_id, None)
            _WATCHERS.pop(stream_id, None)


async def start_recording(stream: LiveStream, db: AsyncSession) -> None:
    if stream.source != "rtmp" or not stream.rtmp_key:
        return

    async with _LOCK:
        existing = _RECORDERS.get(stream.id)
        if existing and existing.returncode is None:
            return

        filename = get_recording_status_filename(stream)
        output_path = get_recording_path(filename)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        hls_url = f"http://rtmp/hls/{stream.rtmp_key}.m3u8"
        try:
            stream.recording_filename = filename
            stream.recording_url = None
            stream.recording_status = "recording"
            stream.recording_started_at = datetime.now(timezone.utc)
            stream.recording_completed_at = None
            stream.recording_s3_key = None
            await db.flush()

            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-y",
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "warning",
                "-i",
                hls_url,
                "-reconnect",
                "1",
                "-reconnect_streamed",
                "1",
                "-reconnect_delay_max",
                "5",
                "-c",
                "copy",
                "-bsf:a",
                "aac_adtstoasc",
                "-movflags",
                "+faststart",
                str(output_path),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )

            _RECORDERS[stream.id] = process
            _WATCHERS[stream.id] = asyncio.create_task(_watch_recording(stream.id, filename, process))
        except Exception:
            logger.exception("Failed to start live recording for stream %s", stream.id)
            stream.recording_status = "failed"
            stream.recording_completed_at = datetime.now(timezone.utc)
            await db.flush()


async def stop_recording(stream_id: uuid.UUID, timeout_seconds: int = 15) -> None:
    async with _LOCK:
        process = _RECORDERS.get(stream_id)
        watcher = _WATCHERS.get(stream_id)

    if process is None:
        return

    if process.returncode is None:
        try:
            process.send_signal(signal.SIGINT)
        except ProcessLookupError:
            pass
        try:
            await asyncio.wait_for(process.wait(), timeout=timeout_seconds)
        except TimeoutError:
            logger.warning("Recording process for stream %s did not stop in time", stream_id)
            process.kill()
            await process.wait()

    if watcher is not None:
        try:
            await asyncio.wait_for(watcher, timeout=timeout_seconds)
        except TimeoutError:
            logger.warning("Recording watcher for stream %s did not finish in time", stream_id)
