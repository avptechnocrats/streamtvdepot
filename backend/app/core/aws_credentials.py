"""
AWS credentials/config resolution: database first, `.env` second.

The superadmin Settings page stores AWS values in `superadmin_settings.config["aws"]` (secret
Fernet-encrypted). Every AWS call site reads `app.core.config.settings` at call time, so this module
overlays the database values onto that object at startup, after each settings update, and on a timer
(other workers pick up changes). Clearing a database value falls back to the original `.env` value.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_secret
from app.models.superadmin.settings import SuperadminSettings

logger = logging.getLogger(__name__)

REFRESH_INTERVAL = 60  # seconds

# database key → settings attribute
_PLAIN_FIELDS = {
    "storage_backend": "STORAGE_BACKEND",
    "aws_s3_bucket": "AWS_S3_BUCKET",
    "aws_region": "AWS_REGION",
    "aws_s3_storage_class": "AWS_S3_STORAGE_CLASS",
    "cloudfront_domain": "CLOUDFRONT_DOMAIN",
    "cloudfront_distribution_id": "CLOUDFRONT_DISTRIBUTION_ID",
    "mediaconvert_endpoint": "MEDIACONVERT_ENDPOINT",
    "mediaconvert_role_arn": "MEDIACONVERT_ROLE_ARN",
}
_KEY_ID_ATTR = "AWS_ACCESS_KEY_ID"
_SECRET_ATTR = "AWS_SECRET_ACCESS_KEY"

# What `.env` provided, captured once so a cleared database value reverts to it.
_ENV_VALUES: dict[str, str] = {
    attr: getattr(settings, attr) for attr in (*_PLAIN_FIELDS.values(), _KEY_ID_ATTR, _SECRET_ATTR)
}


def _has_value(value: object) -> bool:
    return value is not None and str(value).strip() != ""


def apply(aws_config: dict | None) -> None:
    """Overlay the stored AWS config onto `settings`; anything missing keeps its `.env` value."""
    aws_config = aws_config or {}

    for db_key, attr in _PLAIN_FIELDS.items():
        value = aws_config.get(db_key)
        setattr(settings, attr, str(value).strip() if _has_value(value) else _ENV_VALUES[attr])

    # The key id and secret only make sense together: use the database pair or the `.env` pair, never a mix.
    key_id = aws_config.get("aws_access_key_id")
    encrypted_secret = aws_config.get("aws_secret_access_key_encrypted")
    db_pair: tuple[str, str] | None = None
    if _has_value(key_id) and _has_value(encrypted_secret):
        try:
            db_pair = (str(key_id).strip(), decrypt_secret(encrypted_secret))
        except RuntimeError:
            logger.warning("Stored AWS secret could not be decrypted; falling back to .env credentials")

    if db_pair:
        setattr(settings, _KEY_ID_ATTR, db_pair[0])
        setattr(settings, _SECRET_ATTR, db_pair[1])
    else:
        setattr(settings, _KEY_ID_ATTR, _ENV_VALUES[_KEY_ID_ATTR])
        setattr(settings, _SECRET_ATTR, _ENV_VALUES[_SECRET_ATTR])


async def refresh_from_db() -> None:
    async with AsyncSessionLocal() as session:
        row = (await session.execute(select(SuperadminSettings).limit(1))).scalar_one_or_none()
    apply((row.config or {}).get("aws") if row else None)


async def run_refresher() -> None:
    while True:
        await asyncio.sleep(REFRESH_INTERVAL)
        try:
            await refresh_from_db()
        except Exception:
            logger.exception("AWS settings refresh failed")
