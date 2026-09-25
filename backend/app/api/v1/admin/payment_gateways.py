"""
Admin – Payment Gateway Settings
=================================
GET  /admin/payment-gateways   → return current config; secrets masked as *_set booleans
PUT  /admin/payment-gateways   → upsert config; encrypt secrets before storing in site_config JSONB

Security principles:
  • Only non-sensitive values (enabled flag, mode, publishable_key, client_id) are returned in
    GET responses.  Secret keys and webhook secrets are NEVER sent to the client.
  • Secrets are encrypted with Fernet (AES-256-CBC + HMAC-SHA256) using DRM_FERNET_KEY before
    being stored in the client's site_config JSONB column.
  • A null / empty-string value in a PUT request clears the stored secret.
  • A missing key in the PUT request leaves the stored value unchanged.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.core.security import encrypt_secret
from app.models.superadmin.client import Client
from app.schemas.client.payment_gateways import (
    PaymentGatewaysIn,
    PaymentGatewaysOut,
    PayPalSettingsOut,
    StripeSettingsOut,
    RazorpaySettingsOut,
    CashfreeSettingsOut,
)

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────
async def _get_client(client_id: uuid.UUID, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


def _build_response(cfg: dict) -> PaymentGatewaysOut:
    """Convert the raw site_config dict into typed gateway response (secrets masked)."""
    gateways = cfg.get("payment_gateways", {})
    default_gateway = gateways.get("default_gateway")
    pp = gateways.get("paypal", {})
    st = gateways.get("stripe", {})
    rz = gateways.get("razorpay", {})
    cf = gateways.get("cashfree", {})

    def snapshot(raw: dict, mode: str, public_key: str, secret_keys: tuple[str, ...]) -> dict:
        stored = raw.get(mode)
        if not isinstance(stored, dict):
            stored = raw if raw.get("mode") == mode else {}
        result = {public_key: stored.get(public_key)}
        for key in secret_keys:
            result[f"{key}_set"] = bool(stored.get(f"{key}_encrypted"))
        return result

    def is_default(name: str) -> bool:
        return default_gateway == name

    return PaymentGatewaysOut(
        default_gateway=default_gateway,
        paypal=PayPalSettingsOut(
            enabled=pp.get("enabled", False),
            mode=pp.get("mode", "sandbox"),
            is_default=is_default("paypal"),
            client_id=pp.get("client_id"),
            client_secret_set=bool(pp.get("client_secret_encrypted")),
            sandbox=snapshot(pp, "sandbox", "client_id", ("client_secret",)),
            live=snapshot(pp, "live", "client_id", ("client_secret",)),
        ),
        stripe=StripeSettingsOut(
            enabled=st.get("enabled", False),
            mode=st.get("mode", "test"),
            is_default=is_default("stripe"),
            publishable_key=st.get("publishable_key"),
            secret_key_set=bool(st.get("secret_key_encrypted")),
            webhook_secret_set=bool(st.get("webhook_secret_encrypted")),
            test=snapshot(st, "test", "publishable_key", ("secret_key", "webhook_secret")),
            live=snapshot(st, "live", "publishable_key", ("secret_key", "webhook_secret")),
        ),
        razorpay=RazorpaySettingsOut(
            enabled=rz.get("enabled", False),
            mode=rz.get("mode", "test"),
            is_default=is_default("razorpay"),
            key_id=rz.get("key_id"),
            key_secret_set=bool(rz.get("key_secret_encrypted")),
            webhook_secret_set=bool(rz.get("webhook_secret_encrypted")),
            test=snapshot(rz, "test", "key_id", ("key_secret", "webhook_secret")),
            live=snapshot(rz, "live", "key_id", ("key_secret", "webhook_secret")),
        ),
        cashfree=CashfreeSettingsOut(
            enabled=cf.get("enabled", False),
            mode=cf.get("mode", "test"),
            is_default=is_default("cashfree"),
            app_id=cf.get("app_id"),
            app_secret_set=bool(cf.get("app_secret_encrypted")),
            test=snapshot(cf, "test", "app_id", ("app_secret",)),
            live=snapshot(cf, "live", "app_id", ("app_secret",)),
        ),
    )


def _update_secret(sub: dict, key_encrypted: str, new_value: str | None) -> None:
    """
    Update an encrypted secret field in the sub-dict.

    Rules:
      - new_value is None  → field not sent in request → leave unchanged
      - new_value == ""    → explicitly clearing the secret → delete key
      - new_value non-empty → encrypt and store
    """
    if new_value is None:
        return  # not provided – preserve existing
    if new_value.strip() == "":
        sub.pop(key_encrypted, None)  # explicit clear
    else:
        sub[key_encrypted] = encrypt_secret(new_value)


def _update_public(sub: dict, key: str, value: str | None) -> None:
    if value is None:
        return
    if value.strip() == "":
        sub.pop(key, None)
    else:
        sub[key] = value.strip()


def _save_mode(
    gateway: dict,
    mode: str,
    values: dict | None,
    public_keys: tuple[str, ...],
    secret_keys: tuple[str, ...],
) -> None:
    if not isinstance(values, dict):
        return

    mode_values = dict(gateway.get(mode, {}))
    for key in public_keys:
        _update_public(mode_values, key, values.get(key))
    for key in secret_keys:
        _update_secret(mode_values, f"{key}_encrypted", values.get(key))
    gateway[mode] = mode_values


def _sync_active_mode(gateway: dict, mode: str, public_keys: tuple[str, ...], secret_keys: tuple[str, ...]) -> None:
    active = gateway.get(mode)
    if not isinstance(active, dict):
        return
    gateway["mode"] = mode
    for key in public_keys:
        if key in active:
            gateway[key] = active[key]
        else:
            gateway.pop(key, None)
    for key in secret_keys:
        encrypted_key = f"{key}_encrypted"
        if encrypted_key in active:
            gateway[encrypted_key] = active[encrypted_key]
        else:
            gateway.pop(encrypted_key, None)


# ─── GET ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaymentGatewaysOut, summary="Get payment gateway settings")
async def get_payment_gateways(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
) -> PaymentGatewaysOut:
    """Return the current payment gateway configuration for this client.

    Secret keys are never included in the response.  The boolean flags
    ``client_secret_set``, ``secret_key_set``, and ``webhook_secret_set``
    indicate whether each secret has been configured.
    """
    client = await _get_client(admin._client_id, db)
    cfg: dict = dict(client.site_config) if client.site_config else {}
    return _build_response(cfg)


# ─── PUT ──────────────────────────────────────────────────────────────────────

@router.put("", response_model=PaymentGatewaysOut, summary="Save payment gateway settings")
async def save_payment_gateways(
    payload: PaymentGatewaysIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
) -> PaymentGatewaysOut:
    """Persist payment gateway configuration.

    Only the keys explicitly provided in the payload are written; omitted
    keys preserve their current values.  Secret keys are encrypted with
    Fernet before storage and are never returned in any response.
    """
    client = await _get_client(admin._client_id, db)
    cfg: dict = dict(client.site_config) if client.site_config else {}

    # Ensure nested structure exists
    gateways: dict = dict(cfg.get("payment_gateways", {}))
    if payload.default_gateway is not None:
        gateways["default_gateway"] = payload.default_gateway

    def apply_gateway_rules(name: str, enabled: bool | None, make_default: bool | None) -> None:
        if enabled:
            for other_name in ("paypal", "stripe", "razorpay", "cashfree"):
                if other_name != name and isinstance(gateways.get(other_name), dict):
                    gateways[other_name] = {**gateways[other_name], "enabled": False}
        if make_default:
            gateways["default_gateway"] = name

    # ── PayPal ──
    if payload.paypal is not None:
        pp = dict(gateways.get("paypal", {}))
        p = payload.paypal
        if p.enabled is not None:
            pp["enabled"] = p.enabled
        apply_gateway_rules("paypal", p.enabled, p.is_default)
        if p.mode is not None:
            pp["mode"] = p.mode
        if p.client_id is not None:
            if p.client_id.strip() == "":
                pp.pop("client_id", None)
            else:
                pp["client_id"] = p.client_id.strip()
        _update_secret(pp, "client_secret_encrypted", p.client_secret)
        _save_mode(pp, "sandbox", p.sandbox, ("client_id",), ("client_secret",))
        _save_mode(pp, "live", p.live, ("client_id",), ("client_secret",))
        _sync_active_mode(pp, p.mode or pp.get("mode", "sandbox"), ("client_id",), ("client_secret",))
        gateways["paypal"] = pp

    # ── Stripe ──
    if payload.stripe is not None:
        st = dict(gateways.get("stripe", {}))
        s = payload.stripe
        if s.enabled is not None:
            st["enabled"] = s.enabled
        apply_gateway_rules("stripe", s.enabled, s.is_default)
        if s.mode is not None:
            st["mode"] = s.mode
        if s.publishable_key is not None:
            if s.publishable_key.strip() == "":
                st.pop("publishable_key", None)
            else:
                st["publishable_key"] = s.publishable_key.strip()
        _update_secret(st, "secret_key_encrypted", s.secret_key)
        _update_secret(st, "webhook_secret_encrypted", s.webhook_secret)
        _save_mode(st, "test", s.test, ("publishable_key",), ("secret_key", "webhook_secret"))
        _save_mode(st, "live", s.live, ("publishable_key",), ("secret_key", "webhook_secret"))
        _sync_active_mode(st, s.mode or st.get("mode", "test"), ("publishable_key",), ("secret_key", "webhook_secret"))
        gateways["stripe"] = st

    # ── Razorpay ──
    if payload.razorpay is not None:
        rz = dict(gateways.get("razorpay", {}))
        r = payload.razorpay
        if r.enabled is not None:
            rz["enabled"] = r.enabled
        apply_gateway_rules("razorpay", r.enabled, r.is_default)
        if r.mode is not None:
            rz["mode"] = r.mode
        if r.key_id is not None:
            if r.key_id.strip() == "":
                rz.pop("key_id", None)
            else:
                rz["key_id"] = r.key_id.strip()
        _update_secret(rz, "key_secret_encrypted", r.key_secret)
        _update_secret(rz, "webhook_secret_encrypted", r.webhook_secret)
        _save_mode(rz, "test", r.test, ("key_id",), ("key_secret", "webhook_secret"))
        _save_mode(rz, "live", r.live, ("key_id",), ("key_secret", "webhook_secret"))
        _sync_active_mode(rz, r.mode or rz.get("mode", "test"), ("key_id",), ("key_secret", "webhook_secret"))
        gateways["razorpay"] = rz

    # ── Cashfree ──
    if payload.cashfree is not None:
        cf = dict(gateways.get("cashfree", {}))
        c = payload.cashfree
        if c.enabled is not None:
            cf["enabled"] = c.enabled
        apply_gateway_rules("cashfree", c.enabled, c.is_default)
        if c.mode is not None:
            cf["mode"] = c.mode
        if c.app_id is not None:
            if c.app_id.strip() == "":
                cf.pop("app_id", None)
            else:
                cf["app_id"] = c.app_id.strip()
        _update_secret(cf, "app_secret_encrypted", c.app_secret)
        _save_mode(cf, "test", c.test, ("app_id",), ("app_secret",))
        _save_mode(cf, "live", c.live, ("app_id",), ("app_secret",))
        _sync_active_mode(cf, c.mode or cf.get("mode", "test"), ("app_id",), ("app_secret",))
        gateways["cashfree"] = cf

    cfg["payment_gateways"] = gateways
    client.site_config = cfg
    await db.commit()
    await db.refresh(client)

    return _build_response(dict(client.site_config))
