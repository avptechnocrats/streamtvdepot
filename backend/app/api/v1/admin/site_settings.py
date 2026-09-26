import uuid
import asyncio
import smtplib
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.smtp import send_email_via_smtp
from app.core.email_templates import generate_professional_email_html
from app.core.storage import get_s3_client, presign_get_url
from app.core.system_mail import get_client_logo_url, get_platform_logo_url
from app.models.superadmin.client import Client
from app.models.superadmin.settings import SuperadminSettings
from app.schemas.client.site_settings import (
    LogoPresignRequest,
    LogoPresignResponse,
    SiteSettingsIn,
    SiteSettingsOut,
    GeneralSettingsOut,
    EmailSettingsOut,
    GoogleOAuthSettingsOut,
    SocialAuthSettingsOut,
    SmtpTestRequest,
    SmtpTestResponse,
)

router = APIRouter()

_ALLOWED_LOGO_TYPES = {"image/jpeg", "image/png", "image/webp"}
_ALLOWED_FAVICON_TYPES = _ALLOWED_LOGO_TYPES | {"image/x-icon", "image/vnd.microsoft.icon"}


def _smtp_error_detail(
    exc: Exception,
    provided_password: str | None,
    mail_login: str | None,
    mail_server: str | None,
) -> str:
    is_brevo = (mail_server or "").strip().lower() == "smtp-relay.brevo.com"

    if isinstance(exc, smtplib.SMTPAuthenticationError):
        if provided_password and provided_password != provided_password.strip():
            return (
                "SMTP authentication failed (535). SMTP password contains leading/trailing spaces. "
                "Re-enter the key without extra spaces."
            )
        if is_brevo and mail_login and "@" not in mail_login:
            return (
                f"SMTP authentication failed (535). Brevo SMTP login '{mail_login}' looks like a key name or display name, not an email. "
                "Set Login to your Brevo account email address (e.g. you@company.com). "
                "The SMTP key name shown in Brevo panel is NOT the login — only the key value (xsmtpsib-...) is used as password."
            )
        if is_brevo:
            return (
                "SMTP authentication failed (535). Check your Brevo SMTP credentials: "
                "Login must be your Brevo account email address; Password must be the SMTP key value (xsmtpsib-...)."
            )
        if provided_password and provided_password.startswith("xkeysib-"):
            return (
                "SMTP authentication failed (535). You appear to be using a Brevo API key "
                "(xkeysib-...). For SMTP, use Brevo SMTP key (xsmtpsib-...) as password and "
                "the correct SMTP login username/email."
            )
        return (
            "SMTP authentication failed (535). Verify SMTP login and password. "
            "For Brevo, password must be SMTP key (xsmtpsib-...), not API key (xkeysib-...)."
        )

    msg = str(exc)
    if "5.7.8" in msg or "Authentication failed" in msg:
        if provided_password and provided_password != provided_password.strip():
            return (
                "SMTP authentication failed. SMTP password contains leading/trailing spaces. "
                "Re-enter the key without extra spaces."
            )
        if is_brevo and mail_login and "@" not in mail_login:
            return (
                f"SMTP authentication failed. Brevo SMTP login '{mail_login}' looks like a key name or display name, not an email. "
                "Set Login to your Brevo account email address (e.g. you@company.com)."
            )
        if is_brevo:
            return (
                "SMTP authentication failed. Check your Brevo SMTP credentials: "
                "Login must be your Brevo account email address; Password must be the SMTP key value (xsmtpsib-...)."
            )
        if provided_password and provided_password.startswith("xkeysib-"):
            return (
                "SMTP authentication failed. You appear to be using a Brevo API key "
                "(xkeysib-...). For SMTP, use Brevo SMTP key (xsmtpsib-...)."
            )
        return (
            "SMTP authentication failed. Verify SMTP login/password. "
            "For Brevo, use xsmtpsib-... as SMTP password."
        )

    return f"SMTP test failed: {exc}"


def _resolve_field(payload_value, db_value, env_value):
    if payload_value is not None:
        return payload_value, "payload"
    if db_value is not None and str(db_value).strip() != "":
        return db_value, "db"
    if env_value is not None and str(env_value).strip() != "":
        return env_value, "env"
    return None, "missing"


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_client(client_id: uuid.UUID, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


def _build_response(cfg: dict, client_name: str | None = None) -> SiteSettingsOut:
    """Convert the raw site_config dict into a typed response."""
    logo_s3_key: str | None = cfg.get("logo_s3_key")
    favicon_s3_key: str | None = cfg.get("favicon_s3_key")
    logo_url: str | None = None
    if logo_s3_key:
        logo_url = presign_get_url(logo_s3_key, inline=True)
    favicon_url: str | None = None
    if favicon_s3_key:
        favicon_url = presign_get_url(favicon_s3_key, inline=True)

    # Extract social auth settings
    google_oauth_cfg = cfg.get("social_auth", {}).get("google", {}) if cfg.get("social_auth") else {}

    return SiteSettingsOut(
        general=GeneralSettingsOut(
            site_title=cfg.get("site_title"),
            site_url=cfg.get("site_url"),
            tagline=cfg.get("tagline"),
            site_language=cfg.get("site_language"),
            copyright_text=cfg.get("copyright_text"),
            logo_s3_key=logo_s3_key,
            logo_url=logo_url,
            favicon_s3_key=favicon_s3_key,
            favicon_url=favicon_url,
            address1=cfg.get("address1"),
            address2=cfg.get("address2"),
            phone=cfg.get("phone"),
            contact_email=cfg.get("contact_email"),
            youtube_url=cfg.get("youtube_url"),
            instagram_url=cfg.get("instagram_url"),
            facebook_url=cfg.get("facebook_url"),
        ),
        email=EmailSettingsOut(
            admin_email=cfg.get("admin_email"),
            mail_server=cfg.get("mail_server"),
            mail_port=cfg.get("mail_port"),
            mail_login=cfg.get("mail_login"),
            mail_password_set=bool(cfg.get("mail_password")),
        ),
        social_auth=SocialAuthSettingsOut(
            google=GoogleOAuthSettingsOut(
                enabled=google_oauth_cfg.get("enabled", False),
                client_id=google_oauth_cfg.get("client_id"),
                client_secret_set=bool(google_oauth_cfg.get("client_secret")),
                redirect_uri=google_oauth_cfg.get("redirect_uri"),
            )
        ),
        client_name=client_name,
    )


# ─── GET settings ─────────────────────────────────────────────────────────────

@router.get("", response_model=SiteSettingsOut, summary="Get site settings")
async def get_site_settings(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
) -> SiteSettingsOut:
    """Return the saved site settings for the current client."""
    client = await _get_client(admin._client_id, db)
    cfg: dict = dict(client.site_config) if client.site_config else {}
    return _build_response(cfg, client_name=client.name if client else None)


# ─── PUT settings ─────────────────────────────────────────────────────────────

@router.put("", response_model=SiteSettingsOut, summary="Save site settings")
async def save_site_settings(
    payload: SiteSettingsIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
) -> SiteSettingsOut:
    """Persist site settings into the client's ``site_config`` JSONB column.

    Only the keys present in the payload are written; any other data already
    stored in ``site_config`` is preserved.
    """
    client = await _get_client(admin._client_id, db)
    cfg: dict = dict(client.site_config) if client.site_config else {}

    if payload.general is not None:
        g = payload.general
        # For each simple text field: if the client explicitly sent the key
        # (including null = "clear"), write/remove it; if absent, leave alone.
        _GENERAL_TEXT_KEYS = (
            "site_title", "site_url", "tagline", "site_language", "copyright_text",
            "address1", "address2", "phone", "contact_email",
            "youtube_url", "instagram_url", "facebook_url",
        )
        for key in _GENERAL_TEXT_KEYS:
            if key in g.model_fields_set:
                val = getattr(g, key)
                if val is not None:
                    cfg[key] = val
                else:
                    cfg.pop(key, None)
        if g.clear_logo:
            cfg.pop("logo_s3_key", None)
        elif g.logo_s3_key is not None:
            # Validate that the s3_key belongs to this client
            client_slug = getattr(admin, "_client_slug", "") or ""
            slug_prefix = f"{client_slug}/" if client_slug else None
            id_prefix = f"{str(admin._client_id)}/"
            if not (
                (slug_prefix and g.logo_s3_key.startswith(slug_prefix))
                or g.logo_s3_key.startswith(id_prefix)
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid logo_s3_key for this client",
                )
            cfg["logo_s3_key"] = g.logo_s3_key
        if g.clear_favicon:
            cfg.pop("favicon_s3_key", None)
        elif g.favicon_s3_key is not None:
            client_slug = getattr(admin, "_client_slug", "") or ""
            slug_prefix = f"{client_slug}/" if client_slug else None
            id_prefix = f"{str(admin._client_id)}/"
            if not ((slug_prefix and g.favicon_s3_key.startswith(slug_prefix)) or g.favicon_s3_key.startswith(id_prefix)):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid favicon_s3_key for this client")
            cfg["favicon_s3_key"] = g.favicon_s3_key

    if payload.email is not None:
        e = payload.email
        if e.admin_email is not None:
            cfg["admin_email"] = e.admin_email
        if e.mail_server is not None:
            cfg["mail_server"] = e.mail_server
        if e.mail_port is not None:
            cfg["mail_port"] = e.mail_port
        if e.mail_login is not None:
            cfg["mail_login"] = e.mail_login
        if e.mail_password is not None:
            cfg["mail_password"] = e.mail_password

    if payload.social_auth is not None:
        s = payload.social_auth
        if s.google is not None:
            g = s.google
            social_auth = dict(cfg.get("social_auth") or {})
            google = dict(social_auth.get("google") or {})
            client_id = g.client_id.strip() if g.client_id else None
            client_secret = g.client_secret.strip() if g.client_secret else google.get("client_secret")
            redirect_uri = g.redirect_uri.strip() if g.redirect_uri else None

            if g.enabled and not all((client_id, client_secret, redirect_uri)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Google OAuth requires a Client ID, Client Secret, and Redirect URI before it can be enabled.",
                )

            google.update({
                "enabled": g.enabled,
            })
            if g.client_id is not None:
                google["client_id"] = client_id
            if g.client_secret is not None:
                google["client_secret"] = g.client_secret.strip() if g.client_secret else None
            if g.redirect_uri is not None:
                google["redirect_uri"] = redirect_uri
            social_auth["google"] = google
            cfg["social_auth"] = social_auth

    client.site_config = cfg
    await db.commit()
    await db.refresh(client)

    return _build_response(dict(client.site_config), client_name=client.name if client else None)


@router.post("/email/test", response_model=SmtpTestResponse, summary="Send SMTP test email")
async def test_site_smtp_connection(
    payload: SmtpTestRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
) -> SmtpTestResponse:
    """Send a test email to verify SMTP credentials for the current client."""
    client = await _get_client(admin._client_id, db)
    cfg: dict = dict(client.site_config) if client.site_config else {}

    raw_mail_server, mail_server_source = _resolve_field(payload.mail_server, cfg.get("mail_server"), settings.SMTP_HOST)
    raw_mail_port, mail_port_source = _resolve_field(payload.mail_port, cfg.get("mail_port"), settings.SMTP_PORT)
    raw_mail_login, mail_login_source = _resolve_field(payload.mail_login, cfg.get("mail_login"), settings.SMTP_USER)
    raw_mail_password, mail_password_source = _resolve_field(payload.mail_password, cfg.get("mail_password"), settings.SMTP_PASSWORD)
    # Sender should prefer admin email in DB, then env sender, then resolved login.
    resolved_from_email, from_email_source = _resolve_field(None, cfg.get("admin_email"), settings.EMAILS_FROM_EMAIL)

    mail_server = str(raw_mail_server).strip() if raw_mail_server is not None else ""
    mail_port = int(raw_mail_port) if raw_mail_port is not None else None
    mail_login = str(raw_mail_login).strip() if raw_mail_login is not None else ""
    mail_password = str(raw_mail_password) if raw_mail_password is not None else None
    from_email = str(resolved_from_email).strip() if resolved_from_email is not None else ""
    if not from_email and mail_login:
        from_email = mail_login
        from_email_source = "mail_login"

    debug: dict[str, Any] = {
        "credential_source": {
            "mail_server": mail_server_source,
            "mail_port": mail_port_source,
            "mail_login": mail_login_source,
            "mail_password": mail_password_source,
            "from_email": from_email_source,
        },
        "used_db_stored_credentials": any(
            source == "db"
            for source in (mail_server_source, mail_port_source, mail_login_source, mail_password_source, from_email_source)
        ),
        "used_env_fallback": any(
            source == "env"
            for source in (mail_server_source, mail_port_source, mail_login_source, mail_password_source, from_email_source)
        ),
    }

    if not mail_server:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Mail server is required.", "debug": debug})
    if not mail_port:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Mail port is required.", "debug": debug})
    if not mail_login:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Mail login is required.", "debug": debug})
    if not mail_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Mail password is required.", "debug": debug})
    if not from_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Administration email or mail login is required.", "debug": debug})

    # Generate professional HTML email with client logo
    client = await _get_client(admin._client_id, db)
    cfg = dict(client.site_config) if client.site_config else {}
    
    logo_url = await get_client_logo_url(db, admin._client_id)
    
    company_name = cfg.get("site_title") or client.slug or "StreamTVDepot"
    footer_parts = []
    if cfg.get("address1"):
        footer_parts.append(cfg.get("address1"))
    if cfg.get("address2"):
        footer_parts.append(cfg.get("address2"))
    if cfg.get("phone"):
        footer_parts.append(f"Phone: {cfg.get('phone')}")
    if cfg.get("contact_email"):
        footer_parts.append(f"Email: {cfg.get('contact_email')}")
    
    footer_text = "\n".join(footer_parts) if footer_parts else None
    
    html_content = generate_professional_email_html(
        subject=payload.subject.strip(),
        body_text=payload.message,
        logo_url=logo_url,
        company_name=company_name,
        footer_text=footer_text,
    )

    try:
        await asyncio.to_thread(
            send_email_via_smtp,
            host=mail_server,
            port=int(mail_port),
            username=mail_login,
            password=mail_password,
            to_email=str(payload.to_email),
            from_email=from_email,
            subject=payload.subject.strip(),
            body_text=payload.message,
            body_html=html_content,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": _smtp_error_detail(exc, mail_password, mail_login, mail_server), "debug": debug},
        ) from exc

    return SmtpTestResponse(debug=debug)


# ─── Platform Issuer Info ─────────────────────────────────────────────────────

@router.get("/platform-issuer", summary="Get platform issuer information (company details)")
async def get_platform_issuer(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Return the platform's (StreamTVDepot's) company information for invoices and letterhead.
    
    This is fetched from superadmin settings and is accessible to all client admins.
    Used to display company address, phone, and contact info in invoices.
    """
    result = await db.execute(select(SuperadminSettings).limit(1))
    settings_row = result.scalar_one_or_none()
    config = (settings_row.config if settings_row and settings_row.config else {})
    general = config.get("general", {})

    platform_logo_url = await get_platform_logo_url()

    return {
        "company_name": general.get("company_name"),
        "address1": general.get("address1"),
        "address2": general.get("address2"),
        "phone": general.get("phone"),
        "contact_email": general.get("contact_email"),
        "logo_url": platform_logo_url,
    }


# ─── Logo presign ─────────────────────────────────────────────────────────────

@router.post(
    "/logo/presign",
    response_model=LogoPresignResponse,
    summary="Get a presigned URL to upload the site logo",
)
async def presign_logo_upload(
    payload: LogoPresignRequest,
    admin=Depends(get_current_client_admin),
) -> LogoPresignResponse:
    """Return a presigned S3 PUT URL for direct browser-to-S3 logo upload."""
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 storage is not configured.",
        )

    allowed_types = _ALLOWED_FAVICON_TYPES if payload.asset_type == "favicon" else _ALLOWED_LOGO_TYPES
    if payload.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file type: {payload.content_type}. Use JPEG, PNG, WebP, or ICO for favicons." if payload.asset_type == "favicon" else f"Unsupported file type: {payload.content_type}. Use JPEG, PNG, or WebP.",
        )

    ext = payload.filename.rsplit(".", 1)[-1].lower() if "." in payload.filename else "png"
    client_folder = getattr(admin, "_client_slug", "") or str(admin._client_id)
    s3_key = f"{client_folder}/{payload.asset_type}/{uuid.uuid4()}.{ext}"

    try:
        s3 = get_s3_client()
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.AWS_S3_BUCKET,
                "Key": s3_key,
                "ContentType": payload.content_type,
            },
            ExpiresIn=3600,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    return LogoPresignResponse(upload_url=upload_url, s3_key=s3_key)
