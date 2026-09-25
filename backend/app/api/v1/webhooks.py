"""
Payment provider webhook endpoints.

Stripe: POST /webhooks/stripe/{slug}
PayPal: POST /webhooks/paypal/{slug}
Razorpay: POST /webhooks/razorpay/{slug}
Cashfree: POST /webhooks/cashfree/{slug}
Platform Stripe: POST /webhooks/platform/stripe
Platform PayPal: POST /webhooks/platform/paypal

Each endpoint is slug-scoped so we can look up the correct client and
verify the signature against that client's stored webhook secret.
"""

import json
import base64
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Path, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.payment_gateways import get_active_payment_gateway_config
from app.core.security import decrypt_secret
from app.core.system_mail import send_system_email, get_platform_logo_url, get_platform_footer_text
from app.core.email_templates import generate_professional_email_html
from app.core.config import settings
from app.core.subscription import sync_client_account_state_from_subscription
from app.models.client.payment import Payment, PaymentMethod, PaymentStatus
from app.models.client.subscription import ClientSubscriptionPlan
from app.models.superadmin.billing import BillingStatus, SaasBilling
from app.models.superadmin.client import Client, ClientSubscription, SubscriptionStatus
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.models.superadmin.settings import SuperadminSettings

router = APIRouter()


def _parse_iso(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _expected_minor_units(amount: float) -> int:
    return int(round(amount * 100))


async def _get_superadmin_gateway_cfg(db: AsyncSession) -> tuple[dict, dict]:
    settings_result = await db.execute(select(SuperadminSettings).limit(1))
    row = settings_result.scalar_one_or_none()
    cfg = (row.config if row and row.config else {})
    payment_gateway = cfg.get("payment_gateway", {})
    stripe_cfg = payment_gateway.get("stripe", {})
    paypal_cfg = payment_gateway.get("paypal", {})
    return stripe_cfg, paypal_cfg


async def _get_superadmin_extended_gateway_cfg(db: AsyncSession) -> tuple[dict, dict]:
    settings_result = await db.execute(select(SuperadminSettings).limit(1))
    row = settings_result.scalar_one_or_none()
    cfg = (row.config if row and row.config else {})
    payment_gateway = cfg.get("payment_gateway", {})
    return payment_gateway.get("razorpay", {}), payment_gateway.get("cashfree", {})


async def _find_platform_billing(reference_id: str, db: AsyncSession) -> SaasBilling | None:
    try:
        billing_uuid = uuid.UUID(str(reference_id))
    except (TypeError, ValueError):
        billing_uuid = None

    if billing_uuid:
        result = await db.execute(select(SaasBilling).where(SaasBilling.id == billing_uuid))
        billing = result.scalar_one_or_none()
        if billing:
            return billing

    result = await db.execute(select(SaasBilling).where(SaasBilling.transaction_id == str(reference_id)))
    return result.scalar_one_or_none()


def _platform_billing_amount_matches(billing: SaasBilling, amount_minor: int, currency: str) -> bool:
    return (
        amount_minor == _expected_minor_units(float(billing.amount))
        and currency.upper() == str(billing.currency or "").upper()
    )


def _valid_webhook_signature(payload: bytes, signature: str | None, secret: str, *parts: str) -> bool:
    if not signature:
        return False
    signed_payload = b"".join(part.encode() for part in parts) + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _valid_cashfree_signature(payload: bytes, signature: str | None, secret: str, timestamp: str) -> bool:
    if not signature:
        return False
    signed_payload = timestamp.encode() + payload
    digest = hmac.new(secret.encode(), signed_payload, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)


async def _paypal_access_token(client_id_str: str, client_secret: str, sandbox: bool) -> str:
    import base64
    import httpx

    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    auth = base64.b64encode(f"{client_id_str}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            f"{base_url}/v1/oauth2/token",
            headers={"Authorization": f"Basic {auth}"},
            data={"grant_type": "client_credentials"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def _finalize_platform_billing(
    billing_id: str,
    transaction_id: str,
    payment_method: str,
    db: AsyncSession,
):
    try:
        billing_uuid = uuid.UUID(str(billing_id))
    except (TypeError, ValueError):
        return

    billing_result = await db.execute(
        select(SaasBilling).where(SaasBilling.id == billing_uuid).with_for_update()
    )
    billing = billing_result.scalar_one_or_none()
    if not billing:
        return

    if billing.status == BillingStatus.PAID:
        return

    if not billing.plan_id:
        return

    client_result = await db.execute(
        select(Client)
        .where(Client.id == billing.client_id)
        .options(selectinload(Client.subscription))
    )
    client = client_result.scalar_one_or_none()
    if not client:
        return

    plan_result = await db.execute(select(SaasSubscriptionPlan).where(SaasSubscriptionPlan.id == billing.plan_id))
    target_plan = plan_result.scalar_one_or_none()
    if not target_plan:
        return

    now = datetime.now(timezone.utc)
    billing_cycle = str((billing.plan_snapshot or {}).get("billing_cycle") or "monthly").lower()
    if billing_cycle not in {"monthly", "quarterly", "yearly"}:
        billing_cycle = "monthly"
    billing_cycle_days = {"monthly": 30, "quarterly": 90, "yearly": 365}
    current_expiry = _parse_iso(client.subscription.expires_at if client.subscription else None)
    if not current_expiry or current_expiry <= now:
        current_expiry = now + timedelta(days=billing_cycle_days[billing_cycle])

    if client.subscription:
        client.subscription.plan_id = target_plan.id
        client.subscription.status = SubscriptionStatus.ACTIVE
        client.subscription.started_at = now.isoformat()
        client.subscription.expires_at = current_expiry.isoformat()
        client.subscription.auto_renew = True
        client.subscription.billing_cycle = billing_cycle
    else:
        db.add(
            ClientSubscription(
                client_id=client.id,
                plan_id=target_plan.id,
                status=SubscriptionStatus.ACTIVE,
                started_at=now.isoformat(),
                expires_at=current_expiry.isoformat(),
                auto_renew=True,
                billing_cycle=billing_cycle,
            )
        )

    await sync_client_account_state_from_subscription(client.id, db)

    billing.status = BillingStatus.PAID
    billing.paid_at = now.isoformat()
    billing.payment_method = payment_method
    billing.transaction_id = transaction_id
    billing.finalized_at = now.isoformat()

    # Send payment confirmation email with platform branding (Platform → Client)
    logo_url = await get_platform_logo_url()
    platform_name = settings.APP_NAME or "SignalView"
    footer_text = await get_platform_footer_text(db)
    
    expires_str = current_expiry.strftime('%Y-%m-%d') if current_expiry else 'pending'
    body_text = (
        f"Hi {client.email},\\n\\n"
        "Your payment was received successfully and verified.\\n"
        f"Invoice: {billing.invoice_number}\\n"
        f"Plan: {target_plan.name}\\n"
        f"Amount: {float(billing.amount)} {billing.currency}\\n"
        f"Transaction ID: {transaction_id}\\n\\n"
        f"Your plan is now active until {expires_str}.\\n\\n"
        "Thank you for your business."
    )
    
    html_content = generate_professional_email_html(
        subject=f"Payment confirmed - {billing.invoice_number}",
        body_text=body_text,
        logo_url=logo_url,
        company_name=platform_name,
        footer_text=footer_text,
    )
    
    await send_system_email(
        db,
        event_key="client_payment_success_webhook",
        to_email=client.email,
        to_name=client.email,
        subject=f"Payment confirmed - {billing.invoice_number}",
        body_text=body_text,
        body_html=html_content,
        metadata={
            "billing_id": str(billing.id),
            "plan_id": str(target_plan.id),
            "invoice_number": billing.invoice_number,
        },
    )

    await db.commit()


async def _resolve_client(slug: str, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.slug == slug))
    client = result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


async def _load_payment_and_plan(
    payment_id_str: str, client_id: uuid.UUID, db: AsyncSession
):
    payment_result = await db.execute(
        select(Payment).where(
            Payment.id == uuid.UUID(payment_id_str),
            Payment.client_id == client_id,
        ).with_for_update()
    )
    payment = payment_result.scalar_one_or_none()
    if not payment or payment.status == PaymentStatus.SUCCESS:
        return None, None

    plan_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == uuid.UUID(payment.reference_id)
        )
    )
    plan = plan_result.scalar_one_or_none()
    return payment, plan


async def _load_payment_by_order_and_plan(
    order_id: str, client_id: uuid.UUID, db: AsyncSession
):
    payment_result = await db.execute(
        select(Payment).where(
            Payment.gateway_order_id == order_id,
            Payment.client_id == client_id,
        ).with_for_update()
    )
    payment = payment_result.scalar_one_or_none()
    if not payment or payment.status == PaymentStatus.SUCCESS:
        return None, None

    try:
        plan_id = uuid.UUID(str(payment.reference_id))
    except (TypeError, ValueError):
        return None, None
    plan_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == plan_id,
            ClientSubscriptionPlan.client_id == client_id,
        )
    )
    return payment, plan_result.scalar_one_or_none()


async def _complete_tenant_payment_webhook(
    payment: Payment,
    plan: ClientSubscriptionPlan | None,
    client: Client,
    transaction_id: str,
    db: AsyncSession,
) -> None:
    if not plan:
        return
    from app.api.v1.auth.checkout import complete_payment
    from app.models.client.user import EndUser

    user_result = await db.execute(select(EndUser).where(EndUser.id == payment.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return

    notes = json.loads(payment.notes or "{}")
    content_id_str = notes.get("content_id")
    content_id = uuid.UUID(content_id_str) if content_id_str else None
    await complete_payment(payment, plan, client, user, content_id, db, transaction_id)


# ───── Tenant Payment Webhooks ───────────────────────────────────────────────
# ── Stripe ───────────────────────────────────────────────────────────────────
@router.post("/stripe/{slug}", tags=["Webhooks"])
async def stripe_webhook(
    slug: str = Path(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Stripe sends events here. Verifies Stripe-Signature against the client's
    webhook_secret, then fulfills successful PaymentIntents.

    Configure your Stripe webhook URL as:
        https://<your-backend>/api/v1/webhooks/stripe/<client-slug>

    When PLATFORM_STRIPE_SLUG is configured and slug matches, this endpoint
    delegates to the platform SaaS billing handler so both URL styles work.
    """
    # Delegate to platform handler when the slug is the platform billing slug
    if settings.PLATFORM_STRIPE_SLUG and slug == settings.PLATFORM_STRIPE_SLUG:
        return await platform_stripe_webhook(request=request, db=db)

    client = await _resolve_client(slug, db)
    stripe_cfg = get_active_payment_gateway_config(client.site_config, "stripe")

    webhook_secret_encrypted = stripe_cfg.get("webhook_secret_encrypted")
    secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")

    if not secret_key_encrypted:
        raise HTTPException(status_code=400, detail="Stripe not configured for this client")

    stripe.api_key = decrypt_secret(secret_key_encrypted)

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not webhook_secret_encrypted or not sig_header:
        raise HTTPException(status_code=400, detail="Stripe webhook signature is not configured")
    webhook_secret = decrypt_secret(webhook_secret_encrypted)
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    if event["type"] == "payment_intent.succeeded":
        intent = event["data"]["object"]
        payment_id_str = (intent.get("metadata") or {}).get("payment_id")
        if not payment_id_str:
            return {"received": True}

        payment, plan = await _load_payment_and_plan(payment_id_str, client.id, db)
        if payment is None:
            return {"received": True}

        from app.api.v1.auth.checkout import complete_payment
        from app.models.client.user import EndUser

        user_result = await db.execute(select(EndUser).where(EndUser.id == payment.user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            return {"received": True}

        notes = json.loads(payment.notes or "{}")
        content_id_str = notes.get("content_id")
        content_id = uuid.UUID(content_id_str) if content_id_str else None

        await complete_payment(payment, plan, client, user, content_id, db, intent["id"])

    return {"received": True}

# ── PayPal ───────────────────────────────────────────────────────────────────
@router.post("/paypal/{slug}", tags=["Webhooks"])
async def paypal_webhook(
    slug: str = Path(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    PayPal sends events here. Processes PAYMENT.CAPTURE.COMPLETED events.

    Configure your PayPal webhook URL as:
        https://<your-backend>/api/v1/webhooks/paypal/<client-slug>
    """
    import httpx

    client = await _resolve_client(slug, db)
    paypal_cfg = get_active_payment_gateway_config(client.site_config, "paypal")
    client_id = paypal_cfg.get("client_id")
    client_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
    if not client_id or not client_secret_encrypted:
        raise HTTPException(status_code=400, detail="PayPal is not configured for this client")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    if event.get("event_type") != "PAYMENT.CAPTURE.COMPLETED":
        return {"received": True}

    resource = event.get("resource", {})
    order_id = (
        resource.get("supplementary_data", {})
        .get("related_ids", {})
        .get("order_id")
    )
    if not order_id:
        return {"received": True}

    payment, plan = await _load_payment_by_order_and_plan(str(order_id), client.id, db)
    if payment is None or not plan:
        return {"received": True}

    secret = decrypt_secret(client_secret_encrypted)
    sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    access_token = await _paypal_access_token(client_id, secret, sandbox)
    async with httpx.AsyncClient() as http:
        order_response = await http.get(
            f"{base_url}/v2/checkout/orders/{order_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
    if order_response.status_code != 200:
        return {"received": True}

    order = order_response.json()
    capture = (
        order.get("purchase_units", [{}])[0]
        .get("payments", {})
        .get("captures", [{}])[0]
    )
    capture_amount = capture.get("amount", {}) if isinstance(capture, dict) else {}
    try:
        paid_amount = round(float(capture_amount.get("value")), 2)
    except (TypeError, ValueError):
        return {"received": True}
    if (
        order.get("status") != "COMPLETED"
        or capture.get("status") != "COMPLETED"
        or paid_amount != round(float(payment.amount), 2)
        or str(capture_amount.get("currency_code", "")).upper() != str(payment.currency or "").upper()
    ):
        return {"received": True}

    capture_id = capture.get("id")
    if not capture_id:
        return {"received": True}
    await _complete_tenant_payment_webhook(payment, plan, client, str(capture_id), db)

    return {"received": True}

# ── Razorpay ─────────────────────────────────────────────────────────────────
@router.post("/razorpay/{slug}", tags=["Webhooks"])
async def razorpay_webhook(
    slug: str = Path(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Verify and fulfill successful Razorpay payments for one tenant."""
    client = await _resolve_client(slug, db)
    razorpay_cfg = get_active_payment_gateway_config(client.site_config, "razorpay")
    webhook_secret_encrypted = razorpay_cfg.get("webhook_secret_encrypted")
    if not webhook_secret_encrypted:
        raise HTTPException(status_code=400, detail="Razorpay webhook secret is not configured")

    payload = await request.body()
    signature = request.headers.get("x-razorpay-signature")
    if not _valid_webhook_signature(
        payload,
        signature,
        decrypt_secret(webhook_secret_encrypted),
    ):
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    if event.get("event") not in {"payment.captured", "order.paid"}:
        return {"received": True}

    payment_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
    order_entity = event.get("payload", {}).get("order", {}).get("entity", {})
    order_id = payment_entity.get("order_id") or order_entity.get("id")
    transaction_id = payment_entity.get("id") or order_id
    if not order_id or not transaction_id:
        return {"received": True}

    payment, plan = await _load_payment_by_order_and_plan(str(order_id), client.id, db)
    if payment is None:
        return {"received": True}

    amount = payment_entity.get("amount") or order_entity.get("amount_paid") or order_entity.get("amount")
    currency = payment_entity.get("currency") or order_entity.get("currency")
    try:
        amount_minor = int(amount)
    except (TypeError, ValueError):
        return {"received": True}
    if (
        not currency
        or amount_minor != _expected_minor_units(float(payment.amount))
        or str(currency).upper() != str(payment.currency or "").upper()
    ):
        return {"received": True}

    await _complete_tenant_payment_webhook(payment, plan, client, str(transaction_id), db)
    return {"received": True}

# ── Cashfree ─────────────────────────────────────────────────────────────────
@router.post("/cashfree/{slug}", tags=["Webhooks"])
async def cashfree_webhook(
    slug: str = Path(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Verify and fulfill successful Cashfree payments for one tenant.

    Cashfree signs webhooks with the active App Secret. There is no separate
    tenant webhook secret to configure in the Cashfree dashboard.
    """
    client = await _resolve_client(slug, db)
    cashfree_cfg = get_active_payment_gateway_config(client.site_config, "cashfree")
    app_secret_encrypted = cashfree_cfg.get("app_secret_encrypted")
    if not app_secret_encrypted:
        raise HTTPException(status_code=400, detail="Cashfree App Secret is not configured")

    payload = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp")
    signature = request.headers.get("x-webhook-signature")
    if not timestamp or not _valid_cashfree_signature(
        payload,
        signature,
        decrypt_secret(app_secret_encrypted),
        timestamp,
    ):
        raise HTTPException(status_code=400, detail="Invalid Cashfree signature")

    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = str(event.get("type") or event.get("event_type") or "")
    if event_type not in {"PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"}:
        return {"received": True}

    data = event.get("data") or {}
    order = data.get("order") or {}
    payment_entity = data.get("payment") or {}
    order_id = order.get("order_id") or payment_entity.get("order_id")
    transaction_id = payment_entity.get("cf_payment_id") or payment_entity.get("payment_id") or order_id
    if not order_id or not transaction_id:
        return {"received": True}
    if payment_entity.get("payment_status") not in (None, "SUCCESS"):
        return {"received": True}

    payment, plan = await _load_payment_by_order_and_plan(str(order_id), client.id, db)
    if payment is None:
        return {"received": True}

    amount = payment_entity.get("payment_amount") or order.get("order_amount")
    currency = payment_entity.get("payment_currency") or order.get("order_currency")
    try:
        paid_amount = round(float(amount), 2)
    except (TypeError, ValueError):
        return {"received": True}
    if (
        currency is None
        or paid_amount != round(float(payment.amount), 2)
        or str(currency).upper() != str(payment.currency or "").upper()
    ):
        return {"received": True}

    await _complete_tenant_payment_webhook(payment, plan, client, str(transaction_id), db)
    return {"received": True}


# ── Platform Billing Webhooks (Client-admin SaaS upgrades) ───────────────────
# ───── Platform Stripe ───────────────────────────────────────────────────────
@router.post("/platform/stripe", tags=["Webhooks"])
async def platform_stripe_webhook(
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Stripe webhook for client-admin SaaS upgrade fallback finalization.

    This endpoint finalizes pending saas_billing upgrades when checkout succeeds,
    even if the browser callback does not reach /admin/billing/upgrade/confirm.
    """
    stripe_cfg, _ = await _get_superadmin_gateway_cfg(db)
    secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
    if not secret_key_encrypted:
        raise HTTPException(status_code=400, detail="Stripe is not configured")

    stripe.api_key = decrypt_secret(secret_key_encrypted)

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    webhook_secret_encrypted = stripe_cfg.get("webhook_secret_encrypted")
    if not webhook_secret_encrypted or not sig_header:
        raise HTTPException(status_code=400, detail="Stripe webhook secret is not configured")
    webhook_secret = decrypt_secret(webhook_secret_encrypted)
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    if event.get("type") != "checkout.session.completed":
        return {"received": True}

    session = event.get("data", {}).get("object", {})
    if session.get("payment_status") != "paid":
        return {"received": True}

    metadata = session.get("metadata") or {}
    billing_id = metadata.get("billing_id")
    if not billing_id:
        return {"received": True}

    try:
        billing_uuid = uuid.UUID(str(billing_id))
    except (TypeError, ValueError):
        return {"received": True}

    billing_result = await db.execute(select(SaasBilling).where(SaasBilling.id == billing_uuid))
    billing = billing_result.scalar_one_or_none()
    if not billing:
        return {"received": True}

    amount_total = int(session.get("amount_total") or 0)
    expected_minor = _expected_minor_units(float(billing.amount))
    if amount_total != expected_minor:
        return {"received": True}

    currency = str(session.get("currency") or "").upper()
    if currency != str(billing.currency or "").upper():
        return {"received": True}

    payment_intent = session.get("payment_intent")
    transaction_id = str(payment_intent or session.get("id"))

    await _finalize_platform_billing(
        billing_id=billing_id,
        transaction_id=transaction_id,
        payment_method="stripe",
        db=db,
    )
    return {"received": True}

# ───── Platform PayPal ───────────────────────────────────────────────────────
@router.post("/platform/paypal", tags=["Webhooks"])
async def platform_paypal_webhook(
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    PayPal webhook for client-admin SaaS upgrade fallback finalization.

    Handles both:
    - CHECKOUT.ORDER.APPROVED: captures order server-side and finalizes upgrade.
    - PAYMENT.CAPTURE.COMPLETED: finalizes upgrade idempotently.
    """
    import httpx

    _, paypal_cfg = await _get_superadmin_gateway_cfg(db)
    pp_client_id = paypal_cfg.get("client_id")
    pp_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
    if not pp_client_id or not pp_secret_encrypted:
        raise HTTPException(status_code=400, detail="PayPal is not configured")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event.get("event_type")
    resource = event.get("resource", {})

    if event_type not in {"PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.APPROVED"}:
        return {"received": True}

    order_id = (
        resource.get("id")
        if event_type == "CHECKOUT.ORDER.APPROVED"
        else resource.get("supplementary_data", {}).get("related_ids", {}).get("order_id")
    )
    if not order_id:
        return {"received": True}

    pp_secret = decrypt_secret(pp_secret_encrypted)
    sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    access_token = await _paypal_access_token(pp_client_id, pp_secret, sandbox)

    async with httpx.AsyncClient() as http:
        if event_type == "CHECKOUT.ORDER.APPROVED":
            resp = await http.post(
                f"{base_url}/v2/checkout/orders/{order_id}/capture",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                timeout=20,
            )
        else:
            resp = await http.get(
                f"{base_url}/v2/checkout/orders/{order_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=20,
            )
        if resp.status_code not in (200, 201):
            return {"received": True}
        capture_data = resp.json()

    if capture_data.get("status") != "COMPLETED":
        return {"received": True}

    purchase_unit = capture_data.get("purchase_units", [{}])[0]
    capture_obj = purchase_unit.get("payments", {}).get("captures", [{}])[0]
    capture_id = capture_obj.get("id")
    billing_id = purchase_unit.get("custom_id")
    if not capture_id or capture_obj.get("status") != "COMPLETED" or not billing_id:
        return {"received": True}

    billing = await _find_platform_billing(str(billing_id), db)
    capture_amount = capture_obj.get("amount", {})
    try:
        amount_minor = _expected_minor_units(float(capture_amount.get("value")))
    except (TypeError, ValueError):
        return {"received": True}
    if not billing or not _platform_billing_amount_matches(
        billing, amount_minor, str(capture_amount.get("currency_code") or "")
    ):
        return {"received": True}

    await _finalize_platform_billing(
        billing_id=str(billing.id),
        transaction_id=capture_id,
        payment_method="paypal",
        db=db,
    )
    return {"received": True}

# ── Platform Razorpay ────────────────────────────────────────────────────────
@router.post("/platform/razorpay", tags=["Webhooks"])
async def platform_razorpay_webhook(
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Finalize SaaS billing after a verified Razorpay payment event."""
    razorpay_cfg, _ = await _get_superadmin_extended_gateway_cfg(db)
    webhook_secret_encrypted = razorpay_cfg.get("webhook_secret_encrypted")
    if not webhook_secret_encrypted:
        raise HTTPException(status_code=400, detail="Razorpay webhook secret is not configured")

    payload = await request.body()
    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    signature = request.headers.get("x-razorpay-signature")
    if not _valid_webhook_signature(payload, signature, decrypt_secret(webhook_secret_encrypted)):
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

    if event.get("event") not in {"payment.captured", "order.paid"}:
        return {"received": True}

    payment = event.get("payload", {}).get("payment", {}).get("entity", {})
    order = event.get("payload", {}).get("order", {}).get("entity", {})
    reference = (
        (payment.get("notes") or {}).get("billing_id")
        or (order.get("notes") or {}).get("billing_id")
        or payment.get("order_id")
        or order.get("id")
    )
    transaction_id = str(payment.get("id") or order.get("id") or "")
    if not reference or not transaction_id:
        return {"received": True}

    billing = await _find_platform_billing(str(reference), db)
    if not billing or billing.status == BillingStatus.PAID:
        return {"received": True}

    amount = payment.get("amount") or order.get("amount_paid") or order.get("amount")
    currency = payment.get("currency") or order.get("currency")
    try:
        amount_minor = int(amount)
    except (TypeError, ValueError):
        return {"received": True}
    if not currency or not _platform_billing_amount_matches(billing, amount_minor, str(currency)):
        return {"received": True}

    await _finalize_platform_billing(str(billing.id), transaction_id, "razorpay", db)
    return {"received": True}

# ── Platform Cashfree ────────────────────────────────────────────────────────
@router.post("/platform/cashfree", tags=["Webhooks"])
async def platform_cashfree_webhook(
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Finalize SaaS billing after a verified Cashfree success event."""
    _, cashfree_cfg = await _get_superadmin_extended_gateway_cfg(db)
    app_secret_encrypted = cashfree_cfg.get("app_secret_encrypted")
    if not app_secret_encrypted:
        raise HTTPException(status_code=400, detail="Cashfree App Secret is not configured")

    payload = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp")
    signature = request.headers.get("x-webhook-signature")
    if not timestamp or not _valid_cashfree_signature(
        payload,
        signature,
        decrypt_secret(app_secret_encrypted),
        timestamp,
    ):
        raise HTTPException(status_code=400, detail="Invalid Cashfree signature")

    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = str(event.get("type") or event.get("event_type") or "")
    if event_type not in {"PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"}:
        return {"received": True}

    data = event.get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    reference = order.get("order_id") or payment.get("order_id")
    transaction_id = str(payment.get("cf_payment_id") or payment.get("payment_id") or reference or "")
    if not reference or not transaction_id:
        return {"received": True}

    billing = await _find_platform_billing(str(reference), db)
    if not billing or billing.status == BillingStatus.PAID:
        return {"received": True}

    amount = payment.get("payment_amount") or order.get("order_amount")
    currency = payment.get("payment_currency") or order.get("order_currency")
    try:
        amount_minor = _expected_minor_units(float(amount))
    except (TypeError, ValueError):
        return {"received": True}
    if not currency or not _platform_billing_amount_matches(billing, amount_minor, str(currency)):
        return {"received": True}

    await _finalize_platform_billing(str(billing.id), transaction_id, "cashfree", db)
    return {"received": True}
