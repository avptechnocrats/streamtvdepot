"""Platform-owned S3 uploads used by shared demo-content templates."""
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.dependencies import get_current_superadmin
from app.core.storage import get_s3_client, media_display_url

router = APIRouter()

_PREFIX = "platform/demo-assets/"
_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/avi", "video/x-msvideo"}
_AUDIO_TYPES = {"audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "audio/flac", "audio/aac", "audio/x-wav"}
_ALLOWED_TYPES = _IMAGE_TYPES | _VIDEO_TYPES | _AUDIO_TYPES
_MAX_SIZES = {"image": 50 * 1024 * 1024, "audio": 100 * 1024 * 1024, "video": 5 * 1024 * 1024 * 1024}


class DemoAssetPresignRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=500)
    content_type: str
    file_size: int = Field(gt=0)
    purpose: Literal["media", "thumbnail"] = "media"


class DemoAssetPresignResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_at: datetime


class DemoAssetConfirmRequest(BaseModel):
    s3_key: str


class DemoAssetOut(BaseModel):
    s3_key: str
    display_url: str


def _asset_kind(content_type: str) -> str:
    return content_type.split("/", 1)[0]


def _require_storage() -> None:
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="S3 storage is not configured.")
    if not settings.CLOUDFRONT_DOMAIN:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="CLOUDFRONT_DOMAIN is required for durable shared demo assets.")


@router.post("/presign", response_model=DemoAssetPresignResponse)
async def presign_demo_asset_upload(
    payload: DemoAssetPresignRequest,
    _=Depends(get_current_superadmin),
):
    """Issue a direct PUT URL for a platform-owned immutable demo asset."""
    _require_storage()
    if payload.content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported file type.")
    if payload.purpose == "thumbnail" and payload.content_type not in _IMAGE_TYPES:
        raise HTTPException(status_code=422, detail="Thumbnails must be image files.")
    kind = _asset_kind(payload.content_type)
    if payload.file_size > _MAX_SIZES[kind]:
        raise HTTPException(status_code=413, detail=f"{kind.capitalize()} file exceeds the allowed size.")

    extension = Path(payload.filename).suffix.lower() or ".bin"
    s3_key = f"{_PREFIX}{kind}/{uuid.uuid4().hex}{extension}"
    try:
        upload_url = get_s3_client().generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.AWS_S3_BUCKET, "Key": s3_key, "ContentType": payload.content_type},
            ExpiresIn=3600,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc
    return DemoAssetPresignResponse(upload_url=upload_url, s3_key=s3_key, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))


@router.post("/confirm", response_model=DemoAssetOut)
async def confirm_demo_asset_upload(
    payload: DemoAssetConfirmRequest,
    _=Depends(get_current_superadmin),
):
    """Verify an upload and return its durable CDN URL; shared assets are never deleted here."""
    _require_storage()
    if not payload.s3_key.startswith(_PREFIX):
        raise HTTPException(status_code=403, detail="Invalid demo asset key.")
    try:
        get_s3_client().head_object(Bucket=settings.AWS_S3_BUCKET, Key=payload.s3_key)
    except ClientError as exc:
        if str(exc.response.get("Error", {}).get("Code", "")) in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(status_code=404, detail="Uploaded file was not found in storage.") from exc
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc
    display_url = media_display_url(payload.s3_key)
    if not display_url:
        raise HTTPException(status_code=502, detail="Could not create a delivery URL for the uploaded file.")
    return DemoAssetOut(s3_key=payload.s3_key, display_url=display_url)