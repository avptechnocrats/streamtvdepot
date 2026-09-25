"""
Shared S3 / storage utilities.

Presigned GET URLs are the standard way to serve private S3 objects.
IAM-user credentials support up to 7 days (604 800 s) expiry.

SigV4 is forced on the boto3 client to avoid a boto3 SigV2 issue where
x-amz-storage-class is included in the canonical string for GET presigned
URLs. SigV4 presigned GET URLs never include storage-class headers, so they
work directly as <img src> without any extra request headers.
"""
import asyncio
import logging
import re
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import UploadFile

from app.core.config import settings

logger = logging.getLogger(__name__)

# 7 days — maximum supported by AWS SigV4 with IAM user credentials
_PRESIGN_GET_EXPIRY = 604_800

# Force SigV4 — prevents boto3 from using SigV2 (us-east-1 default) which
# incorrectly includes x-amz-storage-class in GET presigned URL signatures.
_S3_CONFIG = Config(signature_version="s3v4")


def get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=_S3_CONFIG,
    )


def build_tenant_s3_key(client_slug: str, filename: str, folder: str = "support-tickets") -> str:
    """Build S3 key with tenant-specific folder structure."""
    safe_slug = re.sub(r"[^a-z0-9-]+", "-", client_slug.lower()).strip("-")
    return f"{safe_slug}/{folder}/{filename}"


async def upload_attachment_to_s3(
    upload_file: UploadFile,
    client_slug: str,
    folder: str = "ticket-attachments",
) -> str | None:
    """
    Upload a file attachment (image or PDF) to S3 in the tenant's folder.
    Returns the S3 key on success, None on failure.
    """
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID:
        return None
    
    try:
        # Generate unique filename
        file_ext = Path(upload_file.filename or "file").suffix.lower() or ""
        unique_name = f"{uuid.uuid4().hex}{file_ext}"
        s3_key = build_tenant_s3_key(client_slug, unique_name, folder)
        
        # Read file content
        content = await upload_file.read()
        content_type = upload_file.content_type or "application/octet-stream"
        
        # Upload to S3
        s3 = get_s3_client()
        extra_args = {"ContentType": content_type}
        if settings.AWS_S3_STORAGE_CLASS:
            extra_args["StorageClass"] = settings.AWS_S3_STORAGE_CLASS
        
        await asyncio.to_thread(
            s3.put_object,
            Bucket=settings.AWS_S3_BUCKET,
            Key=s3_key,
            Body=content,
            **extra_args,
        )
        return s3_key
    except Exception as exc:
        logger.warning("Could not upload attachment to S3: %s", exc)
        return None


def presign_get_url(
    s3_key: str,
    expires_in: int = _PRESIGN_GET_EXPIRY,
    original_filename: str | None = None,
    inline: bool = True,
) -> str | None:
    """
    Generate a presigned GET URL for a private S3 object.

    Returns a URL valid for `expires_in` seconds (default 7 days).
    Returns None on configuration error or AWS failure.
    The returned URL can be used directly as <img src> or <video src>.

    If `original_filename` is provided, ResponseContentDisposition is baked
    into the signed URL so the browser uses the real filename instead of the
    UUID s3_key basename — mirroring the Yii2 createPresignedRequest pattern.
    Set `inline=False` to force a download (attachment) instead of inline view.
    """
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID:
        return None
    try:
        s3 = get_s3_client()
        params: dict = {"Bucket": settings.AWS_S3_BUCKET, "Key": s3_key}
        if original_filename:
            disposition = "inline" if inline else "attachment"
            # Sanitise: strip quotes/newlines to prevent header injection
            safe_name = original_filename.replace('"', "").replace("\n", "").replace("\r", "")
            params["ResponseContentDisposition"] = f'{disposition}; filename="{safe_name}"'
        return s3.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Could not generate presigned GET URL for %s: %s", s3_key, exc)
        return None


def media_display_url(s3_key: str, original_filename: str | None = None) -> str | None:
    """Return the stable CDN URL for browser media, or a signed S3 fallback."""
    cloudfront_domain = settings.CLOUDFRONT_DOMAIN.strip().strip("/")
    if cloudfront_domain:
        return f"https://{cloudfront_domain}/{quote(s3_key, safe='/')}"
    return presign_get_url(s3_key, original_filename=original_filename)
