"""
HLS Streaming Proxy — multi-domain CORS workaround.

CloudFront's standard distribution caches the first ``Access-Control-Allow-Origin``
response header it receives for a given URL and replays it to every subsequent
request, regardless of origin.  This breaks CORS for client storefronts that run
on custom domains (e.g. kalingo.tv) when the cache was first seeded by an admin
panel request (e.g. admin.streamtvdepot.com).

This module proxies HLS manifest files (.m3u8) through the FastAPI backend so
that browsers never contact CloudFront/S3 for manifests.  Segment files (.ts) are
served directly from S3 via short-lived presigned GET URLs embedded in the
rewritten sub-playlists — S3's per-request CORS headers work correctly because
each presigned URL carries SigV4 authentication in the query string and S3
evaluates CORS independently.

Flow
----
1.  Frontend video player calls:
        GET /api/v1/media/stream/{video_id}/manifest.m3u8
    Backend fetches the master .m3u8 from S3 via boto3 (server-side, no CORS),
    rewrites relative sub-playlist references to backend proxy paths, and returns
    the manifest with the same CORS headers as every other API response.

2.  Player requests a quality sub-playlist:
        GET /api/v1/media/stream/{video_id}/{filename:.+\\.m3u8}
    Backend fetches the quality-specific .m3u8 from S3, rewrites relative .ts
    segment lines to presigned S3 GET URLs (6-hour expiry), and returns the
    modified sub-playlist.  The ``#EXT-X-KEY`` URI's query string is rewritten to
    carry the same playback token — the browser's native media stack fetches the
    key directly for some request types (bypassing the player's JS request hooks
    entirely), so the token can't rely on an Authorization header being injected.

3.  .ts segment files are also proxied through the backend:
        GET /api/v1/media/stream/{video_id}/{segment}.ts
    Backend fetches the raw bytes from S3 (server-side, no CORS) and streams
    them to the player — eliminating any dependency on S3 bucket CORS for
    segment delivery.

    ⚠️  TEMPORARY WORKAROUND — see TODO below.

TODO: Revert .ts segment proxying once S3 CORS is properly configured.
----------------------------------------------------------------------
The backend proxying of .ts segments (step 3 above) is a workaround for a
missing IAM permission on the AWS user ``imagdent-s3``.  It routes all video
bandwidth through the FastAPI server, which does not scale for concurrent viewers.

Proper fix (two steps):

  Step 1 — Add the following IAM inline policy to the ``imagdent-s3`` user in
  the AWS Console (IAM → Users → imagdent-s3 → Permissions → Add inline policy):

      {
        "Version": "2012-10-17",
        "Statement": [{
          "Effect": "Allow",
          "Action": ["s3:PutBucketCORS", "s3:GetBucketCORS"],
          "Resource": "arn:aws:s3:::streamtvdepot"
        }]
      }

  Step 2 — Force-recreate the backend container so ``configure_s3_cors()``
  re-runs and applies the CORS policy (which already includes
  ``https://*.preview.streamtvdepot.com`` when PREVIEW_BASE_DOMAIN is set):

      docker compose up -d --force-recreate backend

Once the above is done, revert this file (all restore points are commented-out
code blocks marked ``# RESTORE:`` — just uncomment them and delete the workaround):
  • Uncomment ``_SEGMENT_PRESIGN_TTL``.
  • Delete the workaround ``_rewrite_sub_playlist`` and uncomment the original.
  • Delete the ``_fetch_s3_bytes`` helper function.
  • In ``proxy_sub_playlist``: delete the ``.ts`` branch and uncomment the
    ``# RESTORE:`` call site (the ``.m3u8`` guard below it needs no change).
  • Update this docstring to remove the workaround note.

Access control
--------------
The proxy validates that the video exists and its HLS manifest has been generated.
Paid/DRM-encrypted videos are additionally protected by the AES-128 key delivery
endpoint (/api/v1/drm/key/{video_id}), which requires a valid JWT for non-free
videos — the player cannot decrypt segments without the key regardless of whether
it can load the manifest.
"""

import logging
import re
import uuid as _uuid_module
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import get_db
from app.core.drm import verify_key_access_token
from app.models.client.content import Video

router = APIRouter(tags=["Media – HLS Proxy"])
logger = logging.getLogger(__name__)

_S3_CONFIG = Config(signature_version="s3v4")
_HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl"
# RESTORE: Uncomment when reverting .ts proxy workaround (see module docstring TODO)
# _SEGMENT_PRESIGN_TTL = 6 * 3600  # 6 hours — matches DRM key token lifetime


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _hls_bucket() -> str:
    """S3 bucket where MediaConvert writes HLS output (may differ from upload bucket)."""
    return settings.MEDIACONVERT_OUTPUT_BUCKET or settings.AWS_S3_BUCKET


def _make_s3_client() -> Any:
    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=_S3_CONFIG,
    )


def _dir_prefix(s3_key: str) -> str:
    """Return the directory portion of an S3 key including the trailing slash."""
    return s3_key.rsplit("/", 1)[0] + "/" if "/" in s3_key else ""


def _fetch_s3_text(bucket: str, key: str) -> str:
    """Synchronous S3 GetObject — must be called inside run_in_threadpool."""
    s3 = _make_s3_client()
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read().decode("utf-8")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404"):
            raise FileNotFoundError(key) from exc
        raise


def _fetch_s3_bytes(bucket: str, key: str) -> bytes:
    """Synchronous S3 GetObject returning raw bytes — must be called inside run_in_threadpool."""
    s3 = _make_s3_client()
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404"):
            raise FileNotFoundError(key) from exc
        raise


def _rewrite_master(content: str, video_id: str, token: str | None = None) -> str:
    """
    Replace relative sub-playlist .m3u8 references with backend proxy paths.

    Only bare (non-URI) lines that end in .m3u8 are sub-playlist references in
    a master HLS manifest — directive lines start with '#'.
    """
    prefix = f"{settings.API_V1_PREFIX}/media/stream/{video_id}/"
    suffix = f"?token={token}" if token else ""
    lines = content.splitlines(keepends=True)
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and stripped.endswith(".m3u8"):
            # Preserve any trailing newline from the original line
            newline = line[len(line.rstrip()):]
            out.append(prefix + stripped + suffix + newline)
        else:
            out.append(line)
    return "".join(out)


_EXT_X_KEY_URI_RE = re.compile(r'URI="([^"]+)"')


def _append_token_to_uri(uri: str, token: str) -> str:
    sep = "&" if "?" in uri else "?"
    return f"{uri}{sep}token={token}"


# TODO (WORKAROUND): Delete this function and uncomment the original below once
# S3 CORS is fixed (see module docstring TODO).
def _rewrite_sub_playlist(content: str, video_id: str, token: str | None = None) -> str:
    """Rewrite .ts segment lines to backend proxy paths (workaround — see TODO)."""
    prefix = f"{settings.API_V1_PREFIX}/media/stream/{video_id}/"
    suffix = f"?token={token}" if token else ""
    lines = content.splitlines(keepends=True)
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#EXT-X-KEY") and token:
            # The AES-128 key is fetched by the browser's native media stack for
            # some request paths (Sec-Fetch-Dest: video), which never runs the
            # player's JS "beforeRequest" hook — so an Authorization header can't
            # be relied on. Carry the token as a query param instead, same as the
            # manifest/segment URLs above.
            newline = line[len(line.rstrip()):]
            rewritten = _EXT_X_KEY_URI_RE.sub(
                lambda m: f'URI="{_append_token_to_uri(m.group(1), token)}"', stripped
            )
            out.append(rewritten + newline)
        elif stripped and not stripped.startswith("#") and stripped.endswith(".ts"):
            newline = line[len(line.rstrip()):]
            out.append(prefix + stripped + suffix + newline)
        else:
            out.append(line)
    return "".join(out)


# RESTORE: Delete the function above and uncomment this original implementation:
# def _rewrite_sub_playlist(content: str, dir_prefix: str, bucket: str) -> str:
#     """
#     Replace relative .ts segment lines with presigned S3 GET URLs.
#
#     All other lines (directives, blank lines) are passed through unchanged.
#     The #EXT-X-KEY URI is left intact — it already points to the backend DRM
#     endpoint which carries its own CORS headers.
#     """
#     s3 = _make_s3_client()
#     lines = content.splitlines(keepends=True)
#     out: list[str] = []
#     for line in lines:
#         stripped = line.strip()
#         if stripped and not stripped.startswith("#") and stripped.endswith(".ts"):
#             segment_key = dir_prefix + stripped
#             try:
#                 presigned = s3.generate_presigned_url(
#                     "get_object",
#                     Params={"Bucket": bucket, "Key": segment_key},
#                     ExpiresIn=_SEGMENT_PRESIGN_TTL,
#                 )
#                 newline = line[len(line.rstrip()):]
#                 out.append(presigned + newline)
#             except (BotoCoreError, ClientError) as exc:
#                 # Non-fatal: keep relative reference; player will 403 but not crash
#                 logger.warning("Could not presign segment %s/%s: %s", bucket, segment_key, exc)
#                 out.append(line)
#         else:
#             out.append(line)
#     return "".join(out)


async def _get_active_video(video_id: str, token: str | None, db: AsyncSession) -> Video:
    """Fetch an active HLS video and require a valid stream token when paid."""
    try:
        vid_uuid = _uuid_module.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Video not found.")

    result = await db.execute(
        select(Video).where(
            Video.id == vid_uuid,
            Video.is_active.is_(True),
            Video.deleted_at.is_(None),
        )
    )
    video = result.scalar_one_or_none()
    if not video or not video.hls_manifest_key:
        raise HTTPException(status_code=404, detail="Stream not available.")
    if video.access_type != "free":
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Playback authorization is required.")
        try:
            claims = verify_key_access_token(token)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
        if claims.get("vid") != video_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token is not valid for this video.")
    return video


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get(
    "/{video_id}/manifest.m3u8",
    summary="Proxy HLS master manifest — CORS-safe for all client domains",
    response_class=Response,
    responses={
        200: {"content": {_HLS_CONTENT_TYPE: {}}, "description": "HLS master manifest"},
        404: {"description": "Video not found or stream not ready"},
        503: {"description": "S3 storage not configured"},
    },
)
async def proxy_master_manifest(
    video_id: str,
    token: str | None = Query(None, description="Short-lived playback token for paid videos"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch the master HLS .m3u8 from S3 and return it through the backend.

    Sub-playlist URLs in the manifest are rewritten to point back to this proxy
    (``/api/v1/media/stream/{video_id}/{filename}.m3u8``) so the player never
    contacts CloudFront or S3 directly for manifests.
    """
    if not settings.AWS_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 storage not configured.")

    video = await _get_active_video(video_id, token, db)
    bucket = _hls_bucket()
    key: str = video.hls_manifest_key  # type: ignore[assignment]

    try:
        raw = await run_in_threadpool(_fetch_s3_text, bucket, key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Manifest not found in storage.")
    except (BotoCoreError, ClientError) as exc:
        logger.error("S3 error fetching master manifest %s: %s", key, exc)
        raise HTTPException(status_code=502, detail="Storage error.")

    content = _rewrite_master(raw, video_id, token)
    return Response(
        content=content,
        media_type=_HLS_CONTENT_TYPE,
        headers={"Cache-Control": "no-store, no-cache"},
    )


@router.get(
    "/{video_id}/{filename:path}",
    summary="Proxy HLS quality sub-playlist — rewrites segments to presigned S3 URLs",
    response_class=Response,
    responses={
        200: {"content": {_HLS_CONTENT_TYPE: {}}, "description": "HLS quality sub-playlist"},
        404: {"description": "Sub-playlist not found"},
        503: {"description": "S3 storage not configured"},
    },
)
async def proxy_sub_playlist(
    video_id: str,
    filename: str,
    token: str | None = Query(None, description="Short-lived playback token for paid videos"),
    db: AsyncSession = Depends(get_db),
):
    """
    Serve HLS quality sub-playlists and MPEG-TS segments, both proxied through
    the backend so the player never contacts S3 directly.

    ``.m3u8`` — fetched from S3, ``.ts`` segment lines rewritten to backend proxy
    paths so the player calls this endpoint for each segment.

    ``.ts`` — raw bytes fetched from S3 and streamed to the player.  No S3 CORS
    configuration is required for segment delivery.
    """
    if not settings.AWS_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 storage not configured.")

    video = await _get_active_video(video_id, token, db)
    bucket = _hls_bucket()
    dir_prefix = _dir_prefix(video.hls_manifest_key)  # type: ignore[arg-type]

    # TODO (WORKAROUND): Remove this entire .ts branch once S3 CORS is fixed.
    # Segments should be fetched directly from S3 via presigned URLs embedded in
    # the sub-playlist — not proxied through the backend.  See module docstring.
    if filename.endswith(".ts"):
        segment_key = dir_prefix + filename
        try:
            data = await run_in_threadpool(_fetch_s3_bytes, bucket, segment_key)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Segment not found.")
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 error fetching segment %s: %s", segment_key, exc)
            raise HTTPException(status_code=502, detail="Storage error.")
        return Response(
            content=data,
            media_type="video/MP2T",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    if not filename.endswith(".m3u8"):
        raise HTTPException(status_code=404)

    sub_key = dir_prefix + filename
    try:
        raw = await run_in_threadpool(_fetch_s3_text, bucket, sub_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Sub-playlist not found.")
    except (BotoCoreError, ClientError) as exc:
        logger.error("S3 error fetching sub-playlist %s: %s", sub_key, exc)
        raise HTTPException(status_code=502, detail="Storage error.")

    # RESTORE: Replace the line below with the original call:
    # content = await run_in_threadpool(_rewrite_sub_playlist, raw, dir_prefix, bucket)
    content = await run_in_threadpool(_rewrite_sub_playlist, raw, video_id, token)
    return Response(
        content=content,
        media_type=_HLS_CONTENT_TYPE,
        headers={"Cache-Control": "no-store, no-cache"},
    )
