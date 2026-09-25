from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decrypt_secret
from app.core.smtp import send_email_via_smtp
from app.core.email_templates import generate_professional_email_html
from app.models.superadmin.mail_log import MailDeliveryStatus, SystemMailLog
from app.models.superadmin.settings import SuperadminSettings
from app.models.superadmin.admin_user import AdminUser
from app.models.superadmin.client import Client

logger = logging.getLogger(__name__)


@dataclass
class ResolvedSmtpConfig:
    host: str
    port: int
    username: str
    password: str
    from_email: str
    source: str


def _non_empty(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


async def _resolve_smtp_config(db: AsyncSession) -> ResolvedSmtpConfig | None:
    # 1) Superadmin DB settings (primary)
    row_result = await db.execute(select(SuperadminSettings).limit(1))
    row = row_result.scalar_one_or_none()
    if row and row.config:
        email_cfg = (row.config or {}).get("email", {})
        host = _non_empty(email_cfg.get("mail_server"))
        port_raw = email_cfg.get("mail_port")
        username = _non_empty(email_cfg.get("mail_login"))
        encrypted_password = email_cfg.get("mail_password_encrypted")
        password = _non_empty(decrypt_secret(encrypted_password)) if encrypted_password else None
        from_email = _non_empty(email_cfg.get("admin_email")) or _non_empty(settings.EMAILS_FROM_EMAIL) or username

        if host and port_raw and username and password and from_email:
            return ResolvedSmtpConfig(
                host=host,
                port=int(port_raw),
                username=username,
                password=password,
                from_email=from_email,
                source="superadmin_db",
            )

    # 2) .env fallback
    env_host = _non_empty(settings.SMTP_HOST)
    env_port = int(settings.SMTP_PORT) if settings.SMTP_PORT else None
    env_user = _non_empty(settings.SMTP_USER)
    env_password = _non_empty(settings.SMTP_PASSWORD)
    env_from = _non_empty(settings.EMAILS_FROM_EMAIL) or env_user
    if env_host and env_port and env_user and env_password and env_from:
        return ResolvedSmtpConfig(
            host=env_host,
            port=env_port,
            username=env_user,
            password=env_password,
            from_email=env_from,
            source="env",
        )

    return None


async def get_platform_notification_email(db: AsyncSession) -> str | None:
    row_result = await db.execute(select(SuperadminSettings).limit(1))
    row = row_result.scalar_one_or_none()
    if row and row.config:
        email_cfg = (row.config or {}).get("email", {})
        admin_email = _non_empty(email_cfg.get("admin_email"))
        if admin_email:
            return admin_email

    env_email = _non_empty(settings.EMAILS_FROM_EMAIL) or _non_empty(settings.SMTP_USER)
    if env_email:
        return env_email

    superadmin_result = await db.execute(
        select(AdminUser.email).where(AdminUser.is_superadmin.is_(True), AdminUser.is_active.is_(True)).limit(1)
    )
    return superadmin_result.scalar_one_or_none()


async def get_client_notification_email(db: AsyncSession, client_id: uuid.UUID) -> str | None:
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        return None

    cfg = client.site_config or {}
    return _non_empty(cfg.get("contact_email")) or _non_empty(cfg.get("admin_email")) or _non_empty(client.email)


async def get_client_logo_url(db: AsyncSession, client_id: uuid.UUID) -> str | None:
    """Get S3 presigned URL for client's logo, if available."""
    from app.core.storage import presign_get_url
    
    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        return None
    
    cfg = client.site_config or {}
    logo_s3_key = cfg.get("logo_s3_key")
    if logo_s3_key:
        try:
            return presign_get_url(logo_s3_key, inline=True)
        except Exception:
            return None
    
    return None


async def get_platform_logo_url() -> str | None:
    """Get S3 presigned URL for platform's logo_light.png, if available."""
    from app.core.storage import presign_get_url
    from app.core.config import settings
    
    platform_logo_key = getattr(settings, "PLATFORM_LOGO_S3_KEY", None) or "platform/logo_light.png"
    try:
        return presign_get_url(platform_logo_key, inline=True)
    except Exception:
        return None


async def get_client_footer_text(client_cfg: dict) -> str | None:
    """Build footer address text from client config."""
    footer_parts = []
    if client_cfg.get("address1"):
        footer_parts.append(client_cfg.get("address1"))
    if client_cfg.get("address2"):
        footer_parts.append(client_cfg.get("address2"))
    if client_cfg.get("phone"):
        footer_parts.append(f"Phone: {client_cfg.get('phone')}")
    if client_cfg.get("contact_email"):
        footer_parts.append(f"Email: {client_cfg.get('contact_email')}")
    
    return "\n".join(footer_parts) if footer_parts else None


async def get_platform_footer_text(db: AsyncSession) -> str | None:
    """Build footer address text from platform superadmin settings."""
    from app.models.superadmin.settings import SuperadminSettings
    from sqlalchemy import select
    
    result = await db.execute(select(SuperadminSettings))
    row = result.scalars().first()
    if not row:
        return None
    
    cfg = row.config or {}
    general = cfg.get("general", {})
    
    footer_parts = []
    if general.get("address1"):
        footer_parts.append(general.get("address1"))
    if general.get("address2"):
        footer_parts.append(general.get("address2"))
    if general.get("phone"):
        footer_parts.append(f"Phone: {general.get('phone')}")
    if general.get("contact_email"):
        footer_parts.append(f"Email: {general.get('contact_email')}")
    
    return "\n".join(footer_parts) if footer_parts else None


async def log_mail_event(
    db: AsyncSession,
    *,
    event_key: str,
    recipient_email: str,
    recipient_name: str | None,
    subject: str,
    status: MailDeliveryStatus,
    transport: str,
    config_source: str,
    client_id: uuid.UUID | None = None,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    log = SystemMailLog(
        client_id=client_id,
        event_key=event_key,
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        subject=subject,
        status=status,
        transport=transport,
        config_source=config_source,
        error_message=(error_message[:4000] if error_message else None),
        metadata_json=metadata,
    )
    db.add(log)
    await db.flush()


async def send_system_email(
    db: AsyncSession,
    *,
    event_key: str,
    to_email: str,
    subject: str,
    body_text: str,
    to_name: str | None = None,
    client_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    body_html: str | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> bool:
    """Send a system email via configured SMTP.
    
    Args:
        db: Database session
        event_key: Event identifier for logging
        to_email: Recipient email address
        subject: Email subject
        body_text: Plain text email body
        to_name: Recipient name (optional)
        client_id: Associated client ID (optional)
        metadata: Additional metadata for logging
        body_html: HTML email body (optional, for professional formatted emails)
        attachments: Optional list of (filename, content_bytes, subtype), e.g. PDF invoices
    
    Returns:
        True if email sent successfully, False otherwise
    """
    smtp_cfg = await _resolve_smtp_config(db)
    if smtp_cfg is None:
        await log_mail_event(
            db,
            event_key=event_key,
            recipient_email=to_email,
            recipient_name=to_name,
            subject=subject,
            status=MailDeliveryStatus.SKIPPED,
            transport="smtp",
            config_source="missing",
            client_id=client_id,
            error_message="No SMTP configuration found in superadmin settings or .env",
            metadata=metadata,
        )
        return False

    try:
        await asyncio.to_thread(
            send_email_via_smtp,
            host=smtp_cfg.host,
            port=smtp_cfg.port,
            username=smtp_cfg.username,
            password=smtp_cfg.password,
            to_email=to_email,
            from_email=smtp_cfg.from_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            attachments=attachments,
        )
    except Exception as exc:  # pragma: no cover - network/system dependent
        logger.exception("System mail send failed for event %s", event_key)
        await log_mail_event(
            db,
            event_key=event_key,
            recipient_email=to_email,
            recipient_name=to_name,
            subject=subject,
            status=MailDeliveryStatus.FAILED,
            transport="smtp",
            config_source=smtp_cfg.source,
            client_id=client_id,
            error_message=str(exc),
            metadata=metadata,
        )
        return False

    await log_mail_event(
        db,
        event_key=event_key,
        recipient_email=to_email,
        recipient_name=to_name,
        subject=subject,
        status=MailDeliveryStatus.SENT,
        transport="smtp",
        config_source=smtp_cfg.source,
        client_id=client_id,
        metadata=metadata,
    )
    return True
