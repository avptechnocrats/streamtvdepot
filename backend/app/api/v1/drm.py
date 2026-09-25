"""
DRM key-delivery endpoint.

GET /api/v1/drm/key/{video_id}

The HLS player sends this request (via hls.js xhrSetup) with:
    Authorization: Bearer <key_access_token>

Where <key_access_token> is the short-lived JWT obtained from:
    GET /api/v1/admin/transcoding/videos/{video_id}/key-token

On success, returns the raw 16-byte AES-128 key as
application/octet-stream — exactly what both native HLS (Safari / iOS)
and hls.js expect from an #EXT-X-KEY URI response.

Security:
  • Token expiry prevents indefinite key access.
  • The video_id in the URL is cross-checked against the JWT claim.
  • Rate-limiting (Nginx / API-GW) is strongly recommended in production.
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth.user_subscriptions import get_content_access
from app.core.database import get_db
from app.core.dependencies import get_current_end_user_optional
from app.core.drm import create_key_access_token, decrypt_key, verify_key_access_token
from app.models.client.content import Video

router = APIRouter()

class KeyTokenResponse(BaseModel):
    token: str
    video_id: str
logger = logging.getLogger(__name__)


@router.get(
    "/key/{video_id}",
    response_class=Response,
    summary="Deliver AES-128 decryption key for DRM-protected HLS streams",
    responses={
        200: {"content": {"application/octet-stream": {}}, "description": "Raw 16-byte AES-128 key"},
        401: {"description": "Missing, invalid, or expired key-access token"},
        403: {"description": "Token video_id does not match URL"},
        404: {"description": "Video not found or DRM not enabled"},
    },
)
async def deliver_drm_key(
    video_id: str,
    request: Request,
    token: str | None = Query(
        None, description="Key-access token as a query param — fallback for native"
        " media-element requests that can't carry a custom Authorization header."
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the raw AES-128 key for the requested video, after verifying the
    key-access JWT.  The JWT may be present as an Authorization Bearer header
    (JS-driven requests) or as a ``?token=`` query param (the browser's native
    media stack fetches AES-128 keys directly for some request types, without
    ever running the player's JS request hooks, so it can't attach headers).

    Exception: if the video's access_type is ``free`` the key is delivered
    without a token so that unauthenticated viewers can watch free content.
    """
    # ── Resolve video first so we can check access_type ──────────────────────
    try:
        vid_uuid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid video ID.")

    result = await db.execute(
        select(Video).where(Video.id == vid_uuid, Video.deleted_at.is_(None))
    )
    video = result.scalar_one_or_none()
    if not video or not video.drm_key_encrypted:
        raise HTTPException(status_code=404, detail="DRM key not found for this video.")

    # ── Free videos: skip token check entirely ────────────────────────────────
    if video.access_type == "free":
        try:
            raw_key = decrypt_key(video.drm_key_encrypted)
        except RuntimeError as exc:
            logger.error("DRM key decryption error for video %s: %s", video_id, exc)
            raise HTTPException(status_code=500, detail="Key delivery error.") from exc
        return Response(
            content=raw_key,
            media_type="application/octet-stream",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"},
        )

    # ── Non-free videos: require a valid key-access JWT ───────────────────────
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        key_access_token = auth_header[7:].strip()
    elif token:
        key_access_token = token
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing key-access token. Provide Authorization: Bearer <token> or ?token=.",
        )

    # ── Verify JWT ────────────────────────────────────────────────────────────
    try:
        claims = verify_key_access_token(key_access_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    # Cross-check: token must be for this exact video
    if claims.get("vid") != video_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token is not valid for this video.",
        )

    # ── Decrypt and return raw key ────────────────────────────────────────────
    try:
        raw_key = decrypt_key(video.drm_key_encrypted)
    except RuntimeError as exc:
        logger.error("DRM key decryption error for video %s: %s", video_id, exc)
        raise HTTPException(status_code=500, detail="Key delivery error.") from exc

    return Response(
        content=raw_key,
        media_type="application/octet-stream",
        headers={
            # Prevent CDN/proxy from caching the raw key
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.get(
    "/key-token/{video_id}",
    response_model=KeyTokenResponse,
    summary="Issue a short-lived DRM key-access token for an entitled end user",
)
async def get_user_drm_key_token(
    video_id: str,
    current_user=Depends(get_current_end_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Issue a key-access JWT for a DRM-protected HLS video.

    Free content is public: a token is issued to anyone (the key is also served
    token-less, so this simply keeps the player's request path uniform). Paid,
    subscription and rental content require an authenticated, entitled user —
    anonymous callers get 401 and unentitled callers get 403.
    """
    try:
        vid_uuid = uuid.UUID(video_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid video ID.")

    result = await db.execute(
        select(Video).where(Video.id == vid_uuid, Video.deleted_at.is_(None))
    )
    video = result.scalar_one_or_none()
    if not video or not video.drm_key_encrypted:
        raise HTTPException(status_code=404, detail="DRM key not found for this video.")

    if video.access_type == "free":
        subject = str(current_user.id) if current_user else "anonymous"
        token = create_key_access_token(video_id=video_id, user_id=subject)
        return KeyTokenResponse(token=token, video_id=video_id)

    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in to watch this video.",
        )

    access = await get_content_access(
        db,
        current_user._client_id,
        current_user.id,
        vid_uuid,
    )
    if not access.has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this video.",
        )

    token = create_key_access_token(video_id=video_id, user_id=str(current_user.id))
    return KeyTokenResponse(token=token, video_id=video_id)

