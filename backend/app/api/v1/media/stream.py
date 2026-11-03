"""
HLS Streaming Proxy — multi-domain CORS workaround.

CloudFront's standard distribution caches the first ``Access-Control-Allow-Origin``
response header it receives for a given URL and replays it to every subsequent
request, regardless of origin.  This breaks CORS for client storefronts that run
on custom domains (e.g. kalingo.tv) when the cache was first seeded by an admin
panel request (e.g. admin.streamtvdepot.com).

This module proxies HLS manifest files (.m3u8) through the FastAPI backend so
that browsers never contact CloudFront/S3 for manifests. Segment files (.ts)
use CloudFront signed URLs when VOD signing is configured, otherwise short-lived
S3 presigned URLs. CloudFront must override origin CORS headers for segment
responses; see Docs/AWS_INTEGRATION_GUIDE.md for the required configuration.

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
    segment lines to signed CloudFront or S3 URLs (6-hour expiry), and returns the
    modified sub-playlist.  The ``#EXT-X-KEY`` URI's query string is rewritten to
    carry the same playback token — the browser's native media stack fetches the
    key directly for some request types (bypassing the player's JS request hooks
    entirely), so the token can't rely on an Authorization header being injected.

3.  Segment files (.ts) are served from CloudFront edge caches when VOD signing
    is configured. A single custom policy authorizes only the video's output
    directory. Without VOD signing, the existing S3 presigned URLs are retained.

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
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import get_db
from app.core.drm import verify_key_access_token
from app.models.client.content import MediaAssetRendition, Video

router = APIRouter(tags=["Media – HLS Proxy"])
logger = logging.getLogger(__name__)

_S3_CONFIG = Config(signature_version="s3v4")
_HLS_CONTENT_TYPE = "application/vnd.apple.mpegurl"
_SEGMENT_PRESIGN_TTL = 6 * 3600  # 6 hours — matches DRM key token lifetime


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


@lru_cache(maxsize=1)
def _cloudfront_signer(key_pair_id: str, private_key_pem: str) -> CloudFrontSigner:
    private_key = serialization.load_pem_private_key(
        private_key_pem.replace("\\n", "\n").encode(), password=None,
    )
    if not isinstance(private_key, rsa.RSAPrivateKey):
        raise ValueError("VOD CloudFront signing requires an RSA private key")

    def sign(message: bytes) -> bytes:
        return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())

    return CloudFrontSigner(key_pair_id, sign)


def _cloudfront_segment_base(dir_prefix: str) -> tuple[str, str] | None:
    domain = settings.CLOUDFRONT_DOMAIN.strip().strip("/")
    if not (dir_prefix and domain and settings.VOD_CF_KEY_PAIR_ID and settings.VOD_CF_PRIVATE_KEY_PEM):
        return None
    parsed = urlsplit(f"https://{domain}")
    if not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("CLOUDFRONT_DOMAIN must contain only the CDN hostname")
    prefix = f"https://{domain}/{quote(dir_prefix, safe='/')}"
    signer = _cloudfront_signer(settings.VOD_CF_KEY_PAIR_ID, settings.VOD_CF_PRIVATE_KEY_PEM)
    policy = signer.build_policy(
        prefix + "*", datetime.now(timezone.utc) + timedelta(seconds=_SEGMENT_PRESIGN_TTL),
    )
    signed = signer.generate_presigned_url(prefix + "*", policy=policy)
    return prefix, urlsplit(signed).query


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


def _rewrite_key_uri(uri: str, video_id: str, token: str | None) -> str:
    parsed = urlsplit(uri)
    if "/drm/key/" not in parsed.path:
        return uri
    key_path = parsed.path.rsplit("/", 1)[0] + f"/{video_id}"
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key != "token"]
    if token:
        query.append(("token", token))
    return urlunsplit((parsed.scheme, parsed.netloc, key_path, urlencode(query), parsed.fragment))


def _rewrite_sub_playlist(
    content: str,
    dir_prefix: str,
    bucket: str,
    video_id: str,
    token: str | None = None,
) -> str:
    """Rewrite segments and bind shared HLS key delivery to the requesting video."""
    cloudfront = _cloudfront_segment_base(dir_prefix)
    s3 = None
    lines = content.splitlines(keepends=True)
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#EXT-X-KEY"):
            # Native HLS fetches keys without the player's JS hooks.
            newline = line[len(line.rstrip()):]
            rewritten = _EXT_X_KEY_URI_RE.sub(
                lambda m: f'URI="{_rewrite_key_uri(m.group(1), video_id, token)}"',
                stripped,
            )
            out.append(rewritten + newline)
        elif stripped and not stripped.startswith("#") and stripped.endswith(".ts"):
            segment_key = dir_prefix + stripped
            try:
                if cloudfront:
                    prefix, query = cloudfront
                    presigned = f"{prefix}{quote(stripped, safe='/')}?{query}"
                else:
                    if s3 is None:
                        s3 = _make_s3_client()
                    presigned = s3.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": bucket, "Key": segment_key},
                        ExpiresIn=_SEGMENT_PRESIGN_TTL,
                    )
                newline = line[len(line.rstrip()):]
                out.append(presigned + newline)
            except (BotoCoreError, ClientError) as exc:
                logger.warning("Could not presign segment %s/%s: %s", bucket, segment_key, exc)
                out.append(line)
        else:
            out.append(line)
    return "".join(out)


async def _get_active_video(video_id: str, token: str | None, db: AsyncSession) -> tuple[Video, str]:
    """Return an active video and its HLS manifest key, requiring a stream token when paid."""
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
    if not video:
        raise HTTPException(status_code=404, detail="Stream not available.")
    manifest_key = video.hls_manifest_key
    if video.media_asset_rendition_id:
        rendition_result = await db.execute(
            select(MediaAssetRendition).where(
                MediaAssetRendition.id == video.media_asset_rendition_id,
                MediaAssetRendition.client_id == video.client_id,
            )
        )
        rendition = rendition_result.scalar_one_or_none()
        if not rendition or rendition.status != "complete":
            raise HTTPException(status_code=404, detail="Stream not available.")
        manifest_key = rendition.hls_manifest_key
    if not manifest_key:
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
    return video, manifest_key


# ─── Endpoints ───────────────────────────────────────────────────────────────

async def _get_trailer_manifest_key(video_id: str, db: AsyncSession) -> str:
    """Trailer previews are public marketing content: no token, but only a completed, active one is served."""
    try:
        vid_uuid = _uuid_module.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Trailer not available.")
    result = await db.execute(
        select(Video).where(
            Video.id == vid_uuid,
            Video.is_active.is_(True),
            Video.deleted_at.is_(None),
        )
    )
    video = result.scalar_one_or_none()
    rendition = video.trailer_rendition if video else None
    if (
        not video
        or video.trailer_type != "upload"
        or not rendition
        or rendition.status != "complete"
        or not rendition.hls_manifest_key
    ):
        raise HTTPException(status_code=404, detail="Trailer not available.")
    return rendition.hls_manifest_key


# Registered before the generic routes below so "/trailer/..." is not read as a video id.
@router.get(
    "/trailer/{video_id}/manifest.m3u8",
    summary="Public HLS master manifest for a video's trailer preview",
    response_class=Response,
)
async def proxy_trailer_manifest(video_id: str, db: AsyncSession = Depends(get_db)):
    if not settings.AWS_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 storage not configured.")
    key = await _get_trailer_manifest_key(video_id, db)
    try:
        raw = await run_in_threadpool(_fetch_s3_text, _hls_bucket(), key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Manifest not found in storage.")
    except (BotoCoreError, ClientError) as exc:
        logger.error("S3 error fetching trailer manifest %s: %s", key, exc)
        raise HTTPException(status_code=502, detail="Storage error.")
    return Response(
        content=_rewrite_master(raw, f"trailer/{video_id}"),
        media_type=_HLS_CONTENT_TYPE,
        headers={"Cache-Control": "no-store, no-cache"},
    )


@router.get(
    "/trailer/{video_id}/{filename:path}",
    summary="Public HLS quality sub-playlist for a video's trailer preview",
    response_class=Response,
)
async def proxy_trailer_sub_playlist(video_id: str, filename: str, db: AsyncSession = Depends(get_db)):
    if not settings.AWS_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 storage not configured.")
    if not filename.endswith(".m3u8") or "/" in filename or ".." in filename:
        raise HTTPException(status_code=404)
    manifest_key = await _get_trailer_manifest_key(video_id, db)
    bucket = _hls_bucket()
    dir_prefix = _dir_prefix(manifest_key)
    sub_key = dir_prefix + filename
    try:
        raw = await run_in_threadpool(_fetch_s3_text, bucket, sub_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Sub-playlist not found.")
    except (BotoCoreError, ClientError) as exc:
        logger.error("S3 error fetching trailer sub-playlist %s: %s", sub_key, exc)
        raise HTTPException(status_code=502, detail="Storage error.")
    content = await run_in_threadpool(_rewrite_sub_playlist, raw, dir_prefix, bucket, video_id, None)
    return Response(
        content=content,
        media_type=_HLS_CONTENT_TYPE,
        headers={"Cache-Control": "no-store, no-cache"},
    )

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

    _, key = await _get_active_video(video_id, token, db)
    bucket = _hls_bucket()

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
    summary="Proxy HLS quality sub-playlist — rewrites segments to signed CDN or S3 URLs",
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
    Serve HLS quality sub-playlists with signed CloudFront or S3 segment URLs.
    """
    if not settings.AWS_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 storage not configured.")

    _, manifest_key = await _get_active_video(video_id, token, db)
    bucket = _hls_bucket()
    dir_prefix = _dir_prefix(manifest_key)

    if not filename.endswith(".m3u8") or "/" in filename or ".." in filename:
        raise HTTPException(status_code=404)

    sub_key = dir_prefix + filename
    try:
        raw = await run_in_threadpool(_fetch_s3_text, bucket, sub_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Sub-playlist not found.")
    except (BotoCoreError, ClientError) as exc:
        logger.error("S3 error fetching sub-playlist %s: %s", sub_key, exc)
        raise HTTPException(status_code=502, detail="Storage error.")

    content = await run_in_threadpool(_rewrite_sub_playlist, raw, dir_prefix, bucket, video_id, token)
    return Response(
        content=content,
        media_type=_HLS_CONTENT_TYPE,
        headers={"Cache-Control": "no-store, no-cache"},
    )
