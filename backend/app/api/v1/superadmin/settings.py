"""
Superadmin – Platform Settings
===============================
GET  /superadmin/settings   → return current platform config
PUT  /superadmin/settings   → partial-update config (only provided sections are written)

A single row (singleton) in the ``superadmin_settings`` table stores all config
in a JSONB column.  Secrets (mail password, payment gateway keys) are encrypted
with Fernet before storage and are NEVER sent back in responses.
"""

import uuid
import asyncio
import smtplib
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.core.smtp import send_email_via_smtp
from app.core.email_templates import generate_professional_email_html
from app.core.security import decrypt_secret, encrypt_secret
from app.core.system_mail import get_platform_logo_url
from app.models.superadmin.settings import SuperadminSettings
from app.schemas.superadmin.settings import (
    EmailSettingsOut,
    GeneralSettingsOut,
    PaymentGatewaySettingsOut,
    PayPalOut,
    StripeOut,
    RazorpayOut,
    CashfreeOut,
    SuperadminSettingsIn,
    SuperadminSettingsOut,
    SmtpTestRequest,
    SmtpTestResponse,
)

router = APIRouter()


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

async def _get_or_create_row(db: AsyncSession) -> SuperadminSettings:
    """Return the singleton settings row, creating it if absent."""
    result = await db.execute(select(SuperadminSettings).limit(1))
    row = result.scalar_one_or_none()
    if row is None:
        row = SuperadminSettings(config={})
        db.add(row)
        await db.flush()
    return row


def _build_response(cfg: dict) -> SuperadminSettingsOut:
    g = cfg.get("general", {})
    e = cfg.get("email", {})
    pp = cfg.get("payment_gateway", {}).get("paypal", {})
    st = cfg.get("payment_gateway", {}).get("stripe", {})
    rz = cfg.get("payment_gateway", {}).get("razorpay", {})
    cf = cfg.get("payment_gateway", {}).get("cashfree", {})
    default_gateway = cfg.get("payment_gateway", {}).get("default_gateway")
    return SuperadminSettingsOut(
        general=GeneralSettingsOut(
            company_name=g.get("company_name"),
            contact_email=g.get("contact_email"),
            phone=g.get("phone"),
            address1=g.get("address1"),
            address2=g.get("address2"),
            youtube_url=g.get("youtube_url"),
            instagram_url=g.get("instagram_url"),
            facebook_url=g.get("facebook_url"),
        ),
        email=EmailSettingsOut(
            admin_email=e.get("admin_email"),
            mail_server=e.get("mail_server"),
            mail_port=e.get("mail_port"),
            mail_login=e.get("mail_login"),
            mail_password_set=bool(e.get("mail_password_encrypted")),
        ),
        payment_gateway=PaymentGatewaySettingsOut(
            default_gateway=default_gateway,
            paypal=PayPalOut(
                enabled=pp.get("enabled", False),
                is_default=default_gateway == "paypal",
                mode=pp.get("mode", "sandbox"),
                client_id=pp.get("client_id"),
                client_secret_set=bool(pp.get("client_secret_encrypted")),
            ),
            stripe=StripeOut(
                enabled=st.get("enabled", False),
                is_default=default_gateway == "stripe",
                mode=st.get("mode", "test"),
                publishable_key=st.get("publishable_key"),
                secret_key_set=bool(st.get("secret_key_encrypted")),
                webhook_secret_set=bool(st.get("webhook_secret_encrypted")),
            ),
            razorpay=RazorpayOut(
                enabled=rz.get("enabled", False),
                is_default=default_gateway == "razorpay",
                mode=rz.get("mode", "test"),
                key_id=rz.get("key_id"),
                key_secret_set=bool(rz.get("key_secret_encrypted")),
                webhook_secret_set=bool(rz.get("webhook_secret_encrypted")),
            ),
            cashfree=CashfreeOut(
                enabled=cf.get("enabled", False),
                is_default=default_gateway == "cashfree",
                mode=cf.get("mode", "test"),
                app_id=cf.get("app_id"),
                app_secret_set=bool(cf.get("app_secret_encrypted")),
            ),
        ),
    )


def _update_secret(sub: dict, key_encrypted: str, new_value: str | None) -> None:
    """
    Update an encrypted secret field.
    - None      → not sent in request → leave unchanged
    - ""        → explicit clear
    - non-empty → encrypt and store
    """
    if new_value is None:
        return
    if new_value.strip() == "":
        sub.pop(key_encrypted, None)
    else:
        sub[key_encrypted] = encrypt_secret(new_value)


# ─── GET ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=SuperadminSettingsOut, summary="Get superadmin platform settings")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_superadmin),
) -> SuperadminSettingsOut:
    row = await _get_or_create_row(db)
    await db.commit()
    return _build_response(row.config or {})


# ─── PUT ──────────────────────────────────────────────────────────────────────

@router.put("", response_model=SuperadminSettingsOut, summary="Update superadmin platform settings")
async def update_settings(
    payload: SuperadminSettingsIn,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_superadmin),
) -> SuperadminSettingsOut:
    row = await _get_or_create_row(db)
    cfg: dict = dict(row.config) if row.config else {}

    # ── General ───────────────────────────────────────────────────────────────
    if payload.general is not None:
        g = dict(cfg.get("general", {}))
        data = payload.general.model_dump(exclude_unset=True)
        g.update({k: v for k, v in data.items() if v is not None})
        # Allow explicit None to clear a field
        for k, v in data.items():
            if v is None:
                g.pop(k, None)
        cfg["general"] = g

    # ── Email ─────────────────────────────────────────────────────────────────
    if payload.email is not None:
        e = dict(cfg.get("email", {}))
        em = payload.email
        for field in ("admin_email", "mail_server", "mail_port", "mail_login"):
            val = getattr(em, field, None)
            if val is not None:
                e[field] = val
            elif field in em.model_fields_set:
                e.pop(field, None)
        _update_secret(e, "mail_password_encrypted", em.mail_password)
        cfg["email"] = e

    # ── Payment Gateway ───────────────────────────────────────────────────────
    if payload.payment_gateway is not None:
        pg = dict(cfg.get("payment_gateway", {}))

        if payload.payment_gateway.default_gateway is not None:
            pg["default_gateway"] = payload.payment_gateway.default_gateway

        def apply_gateway_rules(name: str, enabled: bool | None, make_default: bool | None) -> None:
            if enabled:
                for other_name in ("paypal", "stripe", "razorpay", "cashfree"):
                    if other_name != name and isinstance(pg.get(other_name), dict):
                        pg[other_name] = {**pg[other_name], "enabled": False}
                pg["default_gateway"] = name
            elif enabled is False and pg.get("default_gateway") == name:
                pg.pop("default_gateway", None)
            elif make_default:
                pg["default_gateway"] = name

        if payload.payment_gateway.paypal is not None:
            pp = dict(pg.get("paypal", {}))
            p = payload.payment_gateway.paypal
            if p.enabled is not None:
                pp["enabled"] = p.enabled
            apply_gateway_rules("paypal", p.enabled, p.is_default)
            if p.mode is not None:
                pp["mode"] = p.mode
            if p.client_id is not None:
                pp["client_id"] = p.client_id
            elif "client_id" in p.model_fields_set:
                pp.pop("client_id", None)
            _update_secret(pp, "client_secret_encrypted", p.client_secret)
            pg["paypal"] = pp

        if payload.payment_gateway.stripe is not None:
            st = dict(pg.get("stripe", {}))
            s = payload.payment_gateway.stripe
            if s.enabled is not None:
                st["enabled"] = s.enabled
            apply_gateway_rules("stripe", s.enabled, s.is_default)
            if s.mode is not None:
                st["mode"] = s.mode
            if s.publishable_key is not None:
                st["publishable_key"] = s.publishable_key
            elif "publishable_key" in s.model_fields_set:
                st.pop("publishable_key", None)
            _update_secret(st, "secret_key_encrypted", s.secret_key)
            _update_secret(st, "webhook_secret_encrypted", s.webhook_secret)
            pg["stripe"] = st

        if payload.payment_gateway.razorpay is not None:
            rz = dict(pg.get("razorpay", {}))
            r = payload.payment_gateway.razorpay
            if r.enabled is not None:
                rz["enabled"] = r.enabled
            apply_gateway_rules("razorpay", r.enabled, r.is_default)
            if r.mode is not None:
                rz["mode"] = r.mode
            if r.key_id is not None:
                rz["key_id"] = r.key_id
            elif "key_id" in r.model_fields_set:
                rz.pop("key_id", None)
            _update_secret(rz, "key_secret_encrypted", r.key_secret)
            _update_secret(rz, "webhook_secret_encrypted", r.webhook_secret)
            pg["razorpay"] = rz

        if payload.payment_gateway.cashfree is not None:
            cf = dict(pg.get("cashfree", {}))
            c = payload.payment_gateway.cashfree
            if c.enabled is not None:
                cf["enabled"] = c.enabled
            apply_gateway_rules("cashfree", c.enabled, c.is_default)
            if c.mode is not None:
                cf["mode"] = c.mode
            if c.app_id is not None:
                cf["app_id"] = c.app_id
            elif "app_id" in c.model_fields_set:
                cf.pop("app_id", None)
            _update_secret(cf, "app_secret_encrypted", c.app_secret)
            cf.pop("webhook_secret_encrypted", None)
            pg["cashfree"] = cf

        cfg["payment_gateway"] = pg

    from sqlalchemy.orm.attributes import flag_modified
    row.config = cfg
    flag_modified(row, "config")
    await db.commit()
    await db.refresh(row)
    return _build_response(row.config or {})


@router.post("/email/test", response_model=SmtpTestResponse, summary="Send SMTP test email")
async def test_superadmin_smtp_connection(
    payload: SmtpTestRequest,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_superadmin),
) -> SmtpTestResponse:
    row = await _get_or_create_row(db)
    cfg = row.config or {}
    email_cfg = cfg.get("email", {})

    raw_mail_server, mail_server_source = _resolve_field(payload.mail_server, email_cfg.get("mail_server"), settings.SMTP_HOST)
    raw_mail_port, mail_port_source = _resolve_field(payload.mail_port, email_cfg.get("mail_port"), settings.SMTP_PORT)
    raw_mail_login, mail_login_source = _resolve_field(payload.mail_login, email_cfg.get("mail_login"), settings.SMTP_USER)
    encrypted_password = email_cfg.get("mail_password_encrypted")
    saved_password = decrypt_secret(encrypted_password) if encrypted_password else None
    raw_mail_password, mail_password_source = _resolve_field(payload.mail_password, saved_password, settings.SMTP_PASSWORD)
    resolved_from_email, from_email_source = _resolve_field(None, email_cfg.get("admin_email"), settings.EMAILS_FROM_EMAIL)

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

    # Generate professional HTML email with platform branding
    row = await _get_or_create_row(db)
    cfg = row.config or {}
    general = cfg.get("general", {})
    
    # Fetch platform logo (logo_light.png)
    logo_url = await get_platform_logo_url()
    
    company_name = general.get("company_name") or settings.APP_NAME or "StreamTVDepot"
    footer_parts = []
    if general.get("address1"):
        footer_parts.append(general.get("address1"))
    if general.get("address2"):
        footer_parts.append(general.get("address2"))
    if general.get("phone"):
        footer_parts.append(f"Phone: {general.get('phone')}")
    if general.get("contact_email"):
        footer_parts.append(f"Email: {general.get('contact_email')}")
    
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
