import json
import logging
import math
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlparse

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.storage import get_s3_client as _get_s3_client, media_display_url
from app.models.client.content import Category, MediaAsset, Video
from app.schemas.client.content import MediaAssetCreate, MediaAssetOut

router = APIRouter()

logger = logging.getLogger(__name__)

# Allowed MIME types for uploads
_ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
_ALLOWED_VIDEO_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/avi",
    "video/x-msvideo",
}
_ALLOWED_AUDIO_TYPES = {
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "audio/flac",
    "audio/aac",
    "audio/x-wav",
}
_ALLOWED_UPLOAD_TYPES = _ALLOWED_IMAGE_TYPES | _ALLOWED_VIDEO_TYPES | _ALLOWED_AUDIO_TYPES

_MAX_IMAGE_SIZE = 50 * 1024 * 1024    # 50 MB
# OTT mezzanine files can be very large; multipart upload supports much larger objects.
_MAX_VIDEO_SIZE = 500 * 1024 * 1024 * 1024   # 500 GB
_MAX_AUDIO_SIZE = 100 * 1024 * 1024   # 100 MB
_S3_SINGLE_PUT_LIMIT = 5 * 1024 * 1024 * 1024   # 5 GB hard S3 single PUT limit
_S3_MULTIPART_MIN_PART_SIZE = 8 * 1024 * 1024   # 8 MB
_S3_MULTIPART_MAX_PARTS = 10_000


class PresignRequest(BaseModel):
    filename: str
    content_type: str
    file_size: int
    purpose: Literal["thumbnail", "banner"] | None = None


class PresignResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_at: datetime
    storage_class: str | None = None   # returned so browser can echo it as x-amz-storage-class header


class MultipartInitiateRequest(BaseModel):
    filename: str
    content_type: str
    file_size: int
    purpose: Literal["thumbnail", "banner"] | None = None


class MultipartInitiateResponse(BaseModel):
    upload_id: str
    s3_key: str
    part_size: int
    total_parts: int
    expires_at: datetime


class MultipartPresignPartRequest(BaseModel):
    s3_key: str
    upload_id: str
    part_number: int


class MultipartPresignPartResponse(BaseModel):
    upload_url: str
    part_number: int
    expires_at: datetime


class MultipartUploadedPart(BaseModel):
    part_number: int
    etag: str


class MultipartCompleteRequest(BaseModel):
    s3_key: str
    upload_id: str
    parts: list[MultipartUploadedPart]


class MultipartAbortRequest(BaseModel):
    s3_key: str
    upload_id: str


class ConfirmUploadRequest(BaseModel):
    s3_key: str
    original_filename: str
    content_type: str
    file_size: int | None = None
    width: int | None = None
    height: int | None = None
    purpose: Literal["thumbnail", "banner"] | None = None


class ReconcileUploadRequest(BaseModel):
    s3_key: str
    original_filename: str | None = None
    content_type: str | None = None
    file_size: int | None = None
    width: int | None = None
    height: int | None = None


# Aspect ratio rules: (purpose, width_ratio, height_ratio, label)
_ASPECT_RULES: dict[str, tuple[int, int, str]] = {
    "thumbnail": (1, 1, "1:1 (1080 × 1080 px recommended)"),
    "banner": (16, 9, "16:9 (1280 × 720 px recommended)"),
}
# Allow ±5% tolerance on the ratio
_RATIO_TOLERANCE = 0.05


def _derive_client_folder(admin) -> str:
    return getattr(admin, "_client_slug", "") or str(admin._client_id)


def _build_s3_key(*, admin, folder: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"{_derive_client_folder(admin)}/{folder}/{uuid.uuid4()}.{ext}"


def _is_valid_admin_s3_key(*, admin, s3_key: str) -> bool:
    client_slug = getattr(admin, "_client_slug", "")
    slug_prefix = f"{client_slug}/" if client_slug else None
    id_prefix = f"clients/{admin._client_id}/"
    return bool(
        (slug_prefix and s3_key.startswith(slug_prefix))
        or s3_key.startswith(id_prefix)
    )


def _video_upload_part_size(file_size: int) -> int:
    raw_size = max(_S3_MULTIPART_MIN_PART_SIZE, math.ceil(file_size / _S3_MULTIPART_MAX_PARTS))
    mb = 1024 * 1024
    return math.ceil(raw_size / mb) * mb


async def configure_s3_cors(db_session: AsyncSession | None = None) -> None:
    """
    Build and apply a tenant-safe, purpose-split S3 CORS policy.

    PUT (upload) — only allowed from admin origins:
      • localhost / 127.0.0.1 variants (dev)
      • Any domain/subdomain containing "streamtvdepot" (admin panels)

    GET / HEAD (read) — allowed from admin origins PLUS every client's
    own domain/subdomain so their storefronts can display uploaded assets.

    Called once from the FastAPI lifespan with a live DB session.
    """
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID:
        logger.warning("S3 not configured — skipping CORS setup.")
        return

    # ── Shared: dev origins (appear in both PUT and GET rules) ───────────────
    dev_origins: set[str] = {
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8001",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8001",
    }

    # ── streamtvdepot origins: admin panels — allowed for PUT and GET ───────────
    streamtvdepot_origins: set[str] = set()
    streamtvdepot_bases: set[str] = set()

    env_origins: list[str] = list(settings.ALLOWED_ORIGINS) if settings.ALLOWED_ORIGINS else []
    for o in env_origins:
        try:
            host = urlparse(o).hostname or ""
            if "streamtvdepot" in host:
                streamtvdepot_bases.add(host)
                streamtvdepot_origins.add(f"https://{host}")
                streamtvdepot_origins.add(f"https://*.{host}")
        except Exception:
            pass

    # Hard-coded production bases (future-proof)
    for base in ["streamtvdepot.com", "streamtvdepot.io", "streamtvdepot.app"]:
        streamtvdepot_bases.add(base)
        streamtvdepot_origins.add(f"https://{base}")
        streamtvdepot_origins.add(f"https://*.{base}")

    # ── Preview base domain: all <slug>.<preview-domain> origins ─────────────
    # S3 wildcard matches exactly one subdomain level, so
    # https://*.preview.streamtvdepot.com covers kalingo-tv.preview.streamtvdepot.com.
    if settings.PREVIEW_BASE_DOMAIN:
        preview_base = settings.PREVIEW_BASE_DOMAIN.lower().strip()
        streamtvdepot_origins.add(f"https://*.{preview_base}")

    # ── Client origins: storefronts — allowed for GET only ───────────────────
    client_origins: set[str] = set()
    client_slugs: list[str] = []
    if db_session:
        from app.models.superadmin.client import Client
        try:
            result = await db_session.execute(
                select(Client.slug, Client.domain).where(Client.is_active.is_(True))
            )
            for slug, domain in result.all():
                if slug:
                    client_slugs.append(slug)
                    # slug.{every-streamtvdepot-base} — e.g. kalingo-tv.streamtvdepot.com
                    for base in streamtvdepot_bases:
                        streamtvdepot_origins.add(f"https://{slug}.{base}")
                if domain:
                    # Exact client domain and all its subdomains
                    client_origins.add(f"https://{domain}")
                    client_origins.add(f"https://*.{domain}")
        except Exception as exc:
            logger.warning("Could not load client origins from DB for CORS policy: %s", exc)

    # PUT: admin + dev only (no raw client domains — their users never upload)
    upload_origins = sorted(dev_origins | streamtvdepot_origins)
    # GET: everything — admin panels + storefronts + client custom domains
    access_origins = sorted(dev_origins | streamtvdepot_origins | client_origins)

    logger.info(
        "S3 CORS — upload origins: %d | access origins: %d | clients: %s",
        len(upload_origins),
        len(access_origins),
        ", ".join(client_slugs) or "none",
    )

    cors_rules = [
        {
            # Presigned PUT: only from admin origins (localhost or *.streamtvdepot.*)
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["PUT"],
            "AllowedOrigins": upload_origins,
            "ExposeHeaders": ["ETag"],
            "MaxAgeSeconds": 3600,
        },
        {
            # GET / HEAD: admin panels + every client storefront
            "AllowedHeaders": ["Authorization", "Range"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedOrigins": access_origins,
            "ExposeHeaders": ["ETag", "Content-Length", "Content-Type", "Content-Range"],
            "MaxAgeSeconds": 86400,
        },
    ]

    try:
        s3 = _get_s3_client()
        s3.put_bucket_cors(
            Bucket=settings.AWS_S3_BUCKET,
            CORSConfiguration={"CORSRules": cors_rules},
        )
        logger.info("S3 CORS policy applied to bucket '%s'.", settings.AWS_S3_BUCKET)
    except (BotoCoreError, ClientError) as exc:
        logger.warning(
            "Could not apply S3 CORS policy automatically (bucket: %s): %s\n"
            "Paste this JSON into S3 → %s → Permissions → Cross-origin resource sharing (CORS):\n%s",
            settings.AWS_S3_BUCKET,
            exc,
            settings.AWS_S3_BUCKET,
            json.dumps(cors_rules, indent=2),
        )


def _with_display_url(asset: MediaAsset, schema: "MediaAssetOut") -> "MediaAssetOut":
    """Set the browser-safe display URL for a media asset."""
    schema.display_url = media_display_url(asset.s3_key, original_filename=asset.original_filename)
    return schema


@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    payload: PresignRequest,
    admin=Depends(get_current_client_admin),
):
    """Return a presigned S3 PUT URL for direct browser-to-S3 upload."""
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 storage is not configured. Set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your environment.",
        )
    if payload.content_type not in _ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type: {payload.content_type}",
        )
    if payload.content_type in _ALLOWED_VIDEO_TYPES:
        # Single presigned PUT URLs are capped at 5 GB by S3.
        max_size = min(_MAX_VIDEO_SIZE, _S3_SINGLE_PUT_LIMIT)
        size_label = "5 GB"
    elif payload.content_type in _ALLOWED_AUDIO_TYPES:
        max_size = _MAX_AUDIO_SIZE
        size_label = "100 MB"
    else:
        max_size = _MAX_IMAGE_SIZE
        size_label = "50 MB"
    if payload.file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {size_label}",
        )

    folder = payload.purpose or "media"
    s3_key = _build_s3_key(admin=admin, folder=folder, filename=payload.filename)

    try:
        s3 = _get_s3_client()
        # StorageClass is intentionally excluded from the presigned params.
        # Including it adds x-amz-storage-class to SignedHeaders, which triggers
        # a CORS preflight that browsers cannot pass against S3.
        # Storage class is applied server-side in /confirm via copy_object.
        params: dict = {
            "Bucket": settings.AWS_S3_BUCKET,
            "Key": s3_key,
            "ContentType": payload.content_type,
        }
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params=params,
            ExpiresIn=3600,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    return PresignResponse(
        upload_url=upload_url,
        s3_key=s3_key,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=3600),
        storage_class=None,  # Applied server-side in /confirm, not via presigned header
    )


@router.post("/multipart/initiate", response_model=MultipartInitiateResponse)
async def multipart_initiate_upload(
    payload: MultipartInitiateRequest,
    admin=Depends(get_current_client_admin),
):
    """Create an S3 multipart upload session for large media files."""
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 storage is not configured. Set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your environment.",
        )
    if payload.content_type not in _ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type: {payload.content_type}",
        )

    if payload.content_type in _ALLOWED_VIDEO_TYPES:
        max_size = _MAX_VIDEO_SIZE
        size_label = "500 GB"
    elif payload.content_type in _ALLOWED_AUDIO_TYPES:
        max_size = _MAX_AUDIO_SIZE
        size_label = "100 MB"
    else:
        max_size = _MAX_IMAGE_SIZE
        size_label = "50 MB"

    if payload.file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {size_label}",
        )

    # Multipart is needed only for very large files; keep small uploads on single PUT.
    if payload.file_size <= _S3_SINGLE_PUT_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Multipart upload is only required for files larger than 5 GB",
        )

    folder = payload.purpose or "media"
    s3_key = _build_s3_key(admin=admin, folder=folder, filename=payload.filename)
    part_size = _video_upload_part_size(payload.file_size)
    total_parts = math.ceil(payload.file_size / part_size)
    if total_parts > _S3_MULTIPART_MAX_PARTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File is too large for multipart settings. Reduce file size or increase part size.",
        )

    try:
        s3 = _get_s3_client()
        create_args: dict = {
            "Bucket": settings.AWS_S3_BUCKET,
            "Key": s3_key,
            "ContentType": payload.content_type,
        }
        if settings.AWS_S3_STORAGE_CLASS:
            create_args["StorageClass"] = settings.AWS_S3_STORAGE_CLASS
        response = s3.create_multipart_upload(**create_args)
        upload_id = response.get("UploadId")
        if not upload_id:
            raise HTTPException(status_code=502, detail="S3 did not return an upload id")
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    return MultipartInitiateResponse(
        upload_id=upload_id,
        s3_key=s3_key,
        part_size=part_size,
        total_parts=total_parts,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )


@router.post("/multipart/presign-part", response_model=MultipartPresignPartResponse)
async def multipart_presign_part(
    payload: MultipartPresignPartRequest,
    admin=Depends(get_current_client_admin),
):
    """Return a presigned upload_part URL for a specific multipart chunk."""
    if not _is_valid_admin_s3_key(admin=admin, s3_key=payload.s3_key):
        raise HTTPException(status_code=403, detail="Invalid s3_key for this client")
    if payload.part_number < 1 or payload.part_number > _S3_MULTIPART_MAX_PARTS:
        raise HTTPException(status_code=422, detail="Invalid part_number")

    try:
        s3 = _get_s3_client()
        upload_url = s3.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": settings.AWS_S3_BUCKET,
                "Key": payload.s3_key,
                "UploadId": payload.upload_id,
                "PartNumber": payload.part_number,
            },
            ExpiresIn=3600,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    return MultipartPresignPartResponse(
        upload_url=upload_url,
        part_number=payload.part_number,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=3600),
    )


@router.post("/multipart/complete", status_code=status.HTTP_204_NO_CONTENT)
async def multipart_complete_upload(
    payload: MultipartCompleteRequest,
    admin=Depends(get_current_client_admin),
):
    """Complete an S3 multipart upload after all parts are uploaded."""
    if not _is_valid_admin_s3_key(admin=admin, s3_key=payload.s3_key):
        raise HTTPException(status_code=403, detail="Invalid s3_key for this client")
    if not payload.parts:
        raise HTTPException(status_code=422, detail="No uploaded parts provided")

    normalized_parts = sorted(
        (
            {
                "PartNumber": part.part_number,
                "ETag": part.etag.strip().strip('"'),
            }
            for part in payload.parts
        ),
        key=lambda p: p["PartNumber"],
    )

    try:
        s3 = _get_s3_client()
        s3.complete_multipart_upload(
            Bucket=settings.AWS_S3_BUCKET,
            Key=payload.s3_key,
            UploadId=payload.upload_id,
            MultipartUpload={"Parts": normalized_parts},
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc


@router.post("/multipart/abort", status_code=status.HTTP_204_NO_CONTENT)
async def multipart_abort_upload(
    payload: MultipartAbortRequest,
    admin=Depends(get_current_client_admin),
):
    """Abort a multipart upload and discard uploaded parts."""
    if not _is_valid_admin_s3_key(admin=admin, s3_key=payload.s3_key):
        raise HTTPException(status_code=403, detail="Invalid s3_key for this client")

    try:
        s3 = _get_s3_client()
        s3.abort_multipart_upload(
            Bucket=settings.AWS_S3_BUCKET,
            Key=payload.s3_key,
            UploadId=payload.upload_id,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc


@router.post("/confirm", response_model=MediaAssetOut, status_code=status.HTTP_201_CREATED)
async def confirm_upload(
    payload: ConfirmUploadRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Record a completed S3 upload as a MediaAsset."""
    # Verify the s3_key belongs to this client.
    # Accept slug-based paths (new) and uuid-based paths (old tokens / legacy assets).
    if not _is_valid_admin_s3_key(admin=admin, s3_key=payload.s3_key):
        raise HTTPException(status_code=403, detail="Invalid s3_key for this client")

    # Validate aspect ratio when purpose and dimensions are provided
    if payload.purpose and payload.width and payload.height:
        rule = _ASPECT_RULES.get(payload.purpose)
        if rule:
            w_ratio, h_ratio, label = rule
            expected = w_ratio / h_ratio
            actual = payload.width / payload.height
            if abs(actual - expected) / expected > _RATIO_TOLERANCE:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"{payload.purpose.capitalize()} must have a {label} aspect ratio. "
                        f"Uploaded image is {payload.width}×{payload.height}."
                    ),
                )

    # Confirm the object actually landed in S3 before recording it — otherwise a
    # dropped/aborted PUT still produces a MediaAsset row pointing at nothing,
    # which shows as a permanently broken thumbnail that no refresh can fix.
    try:
        s3 = _get_s3_client()
        s3.head_object(Bucket=settings.AWS_S3_BUCKET, Key=payload.s3_key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Upload did not complete — the file was not found in storage. Please try uploading again.",
            ) from exc
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    public_url = (
        f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{payload.s3_key}"
    )

    asset = MediaAsset(
        client_id=admin._client_id,
        original_filename=payload.original_filename,
        s3_key=payload.s3_key,
        url=public_url,
        file_size=payload.file_size,
        content_type=payload.content_type,
        width=payload.width,
        height=payload.height,
    )
    db.add(asset)
    await db.flush()
    await db.refresh(asset)
    out = MediaAssetOut.model_validate(asset)
    out.display_url = media_display_url(asset.s3_key, original_filename=asset.original_filename)

    # Apply desired storage class server-side (avoids signing it into the presigned PUT URL,
    # which would trigger a CORS preflight that browsers cannot pass against S3).
    desired_storage_class = (settings.AWS_S3_STORAGE_CLASS or "").strip().upper()
    # STANDARD is S3's default class; copying large objects just to re-assert
    # STANDARD can add substantial latency and trigger client timeouts.
    if desired_storage_class and desired_storage_class != "STANDARD":
        try:
            s3 = _get_s3_client()
            s3.copy_object(
                Bucket=settings.AWS_S3_BUCKET,
                CopySource={"Bucket": settings.AWS_S3_BUCKET, "Key": payload.s3_key},
                Key=payload.s3_key,
                StorageClass=desired_storage_class,
                MetadataDirective="COPY",
            )
        except (BotoCoreError, ClientError) as exc:
            logger.warning("Could not apply storage class to %s: %s", payload.s3_key, exc)

    return out


@router.post("/reconcile", response_model=MediaAssetOut)
async def reconcile_upload(
    payload: ReconcileUploadRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """
    Recover a media asset when S3 upload completed but /confirm was missed.

    Behavior:
    - If a DB row already exists for this client + s3_key, return it.
    - Otherwise verify the object exists in S3 and recreate the MediaAsset row.
    """
    if not _is_valid_admin_s3_key(admin=admin, s3_key=payload.s3_key):
        raise HTTPException(status_code=403, detail="Invalid s3_key for this client")

    existing_result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.client_id == admin._client_id,
            MediaAsset.s3_key == payload.s3_key,
        )
    )
    existing_asset = existing_result.scalar_one_or_none()
    if existing_asset:
        out = MediaAssetOut.model_validate(existing_asset)
        out.display_url = media_display_url(existing_asset.s3_key, original_filename=existing_asset.original_filename)
        return out

    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 storage is not configured. Set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your environment.",
        )

    try:
        s3 = _get_s3_client()
        head = s3.head_object(Bucket=settings.AWS_S3_BUCKET, Key=payload.s3_key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(status_code=404, detail="S3 object not found for provided s3_key") from exc
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    object_size = payload.file_size if payload.file_size is not None else head.get("ContentLength")
    content_type = payload.content_type or head.get("ContentType") or "application/octet-stream"
    original_filename = payload.original_filename or payload.s3_key.rsplit("/", 1)[-1]

    public_url = (
        f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{payload.s3_key}"
    )

    asset = MediaAsset(
        client_id=admin._client_id,
        original_filename=original_filename,
        s3_key=payload.s3_key,
        url=public_url,
        file_size=object_size,
        content_type=content_type,
        width=payload.width,
        height=payload.height,
    )
    db.add(asset)
    await db.flush()
    await db.refresh(asset)

    out = MediaAssetOut.model_validate(asset)
    out.display_url = media_display_url(asset.s3_key, original_filename=asset.original_filename)
    return out


class MediaLibraryCountsOut(BaseModel):
    all: int
    image: int
    video: int
    audio: int


class MediaLibraryListResponse(BaseModel):
    items: list[MediaAssetOut]
    counts: MediaLibraryCountsOut


async def _media_library_counts(db: AsyncSession, *, client_id, search: str | None) -> MediaLibraryCountsOut:
    counts: dict[str, int] = {}
    for key in ("image", "video", "audio"):
        filters = [MediaAsset.client_id == client_id, MediaAsset.content_type.like(f"{key}/%")]
        if search:
            filters.append(MediaAsset.original_filename.ilike(f"%{search}%"))
        counts[key] = int(await db.scalar(select(func.count()).select_from(MediaAsset).where(*filters)) or 0)
    return MediaLibraryCountsOut(all=sum(counts.values()), **counts)


@router.get("/media-library", response_model=MediaLibraryListResponse)
async def list_media_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    media_type: str | None = Query(None, description="Filter by MIME type prefix, e.g. 'image', 'video', 'audio'"),
    search: str | None = Query(None, description="Case-insensitive filename search"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """List media assets for the current client, plus per-category counts (image/video/audio), in one call."""
    filters = [MediaAsset.client_id == admin._client_id]
    if media_type:
        filters.append(MediaAsset.content_type.like(f"{media_type}/%"))
    if search:
        filters.append(MediaAsset.original_filename.ilike(f"%{search}%"))

    counts = await _media_library_counts(db, client_id=admin._client_id, search=search)

    q = (
        select(MediaAsset)
        .where(*filters)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(MediaAsset.created_at.desc())
    )
    result = await db.execute(q)
    assets = result.scalars().all()

    # Collect which asset IDs are referenced by categories in one query
    if assets:
        asset_ids = [a.id for a in assets]
        used_rows = await db.execute(
            select(Category.thumbnail_asset_id)
            .where(
                Category.client_id == admin._client_id,
                Category.thumbnail_asset_id.in_(asset_ids),
            )
            .union(
                select(Category.banner_asset_id).where(
                    Category.client_id == admin._client_id,
                    Category.banner_asset_id.in_(asset_ids),
                )
            )
        )
        used_ids: set[uuid.UUID] = {row[0] for row in used_rows.all() if row[0]}

        # Collect all S3 URLs referenced by videos: thumbnails (JSONB) + video_url + trailer_url
        video_url_rows = await db.execute(
            select(
                func.jsonb_extract_path_text(Video.thumbnails, "video_banner"),
                func.jsonb_extract_path_text(Video.thumbnails, "video_h_thumbnail"),
                func.jsonb_extract_path_text(Video.thumbnails, "video_w_thumbnail"),
                Video.video_url,
                Video.trailer_url,
            ).where(
                Video.client_id == admin._client_id,
                Video.deleted_at.is_(None),
            )
        )
        video_thumb_keys: set[str] = set()
        for row in video_url_rows.all():
            for url in row:
                if url:
                    # Extract the S3 key from the URL path (strips query string and leading /)
                    # Works for both regional (s3.us-east-1.amazonaws.com) and
                    # non-regional (s3.amazonaws.com) virtual-hosted URLs.
                    key = urlparse(url).path.lstrip("/")
                    if key:
                        video_thumb_keys.add(key)
    else:
        used_ids = set()
        video_thumb_keys = set()

    out = []
    for asset in assets:
        item = MediaAssetOut.model_validate(asset)
        item.display_url = media_display_url(asset.s3_key, original_filename=asset.original_filename)
        # in_use: referenced by category asset ID OR s3_key matches a video thumbnail
        via_category = asset.id in used_ids
        via_video = asset.s3_key in video_thumb_keys
        item.in_use = via_category or via_video
        out.append(item)
    return MediaLibraryListResponse(items=out, counts=counts)


@router.get("/signed-url/{asset_id}", response_model=MediaAssetOut)
async def get_signed_url(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Return a fresh presigned GET URL for an existing media asset."""
    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == asset_id,
            MediaAsset.client_id == admin._client_id,
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")
    out = MediaAssetOut.model_validate(asset)
    out.display_url = media_display_url(asset.s3_key, original_filename=asset.original_filename)
    return out


@router.delete("/media-assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Permanently delete a media asset (S3 + DB). Blocked if asset is in use."""
    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == asset_id,
            MediaAsset.client_id == admin._client_id,
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found")

    # Refuse deletion if the asset is linked to any category
    usage = await db.execute(
        select(func.count()).select_from(Category).where(
            Category.client_id == admin._client_id,
            (Category.thumbnail_asset_id == asset_id) | (Category.banner_asset_id == asset_id),
        )
    )
    if usage.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Asset is in use by one or more categories. Remove it from those categories first.",
        )

    # Remove from S3; log but don't block if already gone
    if settings.AWS_S3_BUCKET and settings.AWS_ACCESS_KEY_ID:
        try:
            s3 = _get_s3_client()
            s3.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=asset.s3_key)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("S3 delete failed for %s: %s", asset.s3_key, exc)

    await db.delete(asset)
    await db.flush()

