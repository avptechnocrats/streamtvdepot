"""
End-user checkout API.

POST /auth/user/checkout/initiate  → create Payment, call Stripe/PayPal
POST /auth/user/checkout/confirm   → verify payment, create subscription/access, create invoice
"""

import asyncio
import base64
from calendar import monthrange
import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable
from urllib.parse import urlparse

import httpx
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_end_user
from app.core.security import decrypt_secret
from app.core.system_mail import send_system_email, get_client_logo_url, get_client_footer_text
from app.core.email_templates import generate_professional_email_html
from app.core.invoice_generator import generate_billing_receipt_pdf
from app.core.payment_gateways import get_active_payment_gateway_config
from app.api.v1.auth.user import _detect_country
from app.models.client.coupon import Coupon, CouponUsage
from app.models.client.content import Audio, PPVEvent, Series, Video
from app.models.client.payment import Invoice, Payment, PaymentMethod, PaymentStatus
from app.models.client.subscription import (
    ClientSubscriptionPlan,
    PlanBillingCycle,
    PlanType,
    SubscriptionStatus,
    UserSubscription,
)
from app.models.client.tax import ClientTax
from app.models.superadmin.client import Client
from app.schemas.client.checkout import (
    CheckoutConfirmRequest,
    CheckoutConfirmResponse,
    CheckoutInitiateRequest,
    CheckoutInitiateResponse,
    CheckoutTaxLine,
    CheckoutTaxQuoteRequest,
    CheckoutTaxQuoteResponse,
    CouponValidateRequest,
    CouponValidateResponse,
    PaymentMethodSetupResponse,
    PaymentMethodStatusResponse,
    SavedPaymentMethodOut,
    SavedPaymentMethodsResponse,
    ScheduleDowngradeRequest,
    ScheduleDowngradeResponse,
    UpgradeInitiateRequest,
    UpgradeInitiateResponse,
)

router = APIRouter()

logger = logging.getLogger(__name__)

# Days per billing cycle for subscription expiry calculation
BILLING_CYCLE_DAYS: dict[str, int | None] = {
    "daily": 1,
    "weekly": 7,
    "monthly": 30,
    "quarterly": 90,
    "yearly": 365,
    "lifetime": None,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_client(client_id: uuid.UUID, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def _gateway_cfg(client: Client) -> tuple[dict, dict]:
    """Return (stripe_cfg, paypal_cfg) from client.site_config."""
    return (
        get_active_payment_gateway_config(client.site_config, "stripe"),
        get_active_payment_gateway_config(client.site_config, "paypal"),
    )


def _cashfree_base_url(mode: str | None) -> str:
    return "https://api.cashfree.com/pg" if mode == "live" else "https://sandbox.cashfree.com/pg"


def _cashfree_customer_phone(current_user) -> str:
    phone = "".join(character for character in (current_user.phone or "") if character.isdigit())
    if not 10 <= len(phone) <= 15:
        raise HTTPException(
            status_code=400,
            detail="A valid phone number is required to pay with Cashfree.",
        )
    return phone


def _cashfree_return_url(client: Client, request: Request, payment_id: uuid.UUID) -> str:
    site_config = client.site_config or {}
    candidates = [
        site_config.get("site_url"),
        client.website,
        f"https://{client.domain}" if client.domain else None,
        request.headers.get("origin"),
    ]
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        base_url = candidate.rstrip("/")
        parsed = urlparse(base_url)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return f"{base_url}/checkout?cashfree_payment_id={payment_id}"
    raise HTTPException(
        status_code=400,
        detail="Cashfree requires a valid public storefront URL. Configure the tenant domain or website before accepting Cashfree payments.",
    )


async def _checkout_country(current_user, request: Request) -> str | None:
    saved_country = (current_user.country or "").strip().upper()
    if saved_country:
        return saved_country
    return await _detect_country(request)


async def _create_or_recover_cashfree_order(
    *,
    app_id: str,
    app_secret: str,
    mode: str,
    order_id: str,
    amount: float,
    currency: str,
    customer_id: str,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    return_url: str,
    order_note: str,
    on_unrecoverable_order: Callable[[], Awaitable[None]],
) -> dict:
    base_url = _cashfree_base_url(mode)
    headers = {
        "x-client-id": app_id,
        "x-client-secret": app_secret,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
    }
    payload = {
        "order_id": order_id,
        "order_amount": round(amount, 2),
        "order_currency": currency.upper(),
        "customer_details": {
            "customer_id": customer_id,
            "customer_name": customer_name,
            "customer_email": customer_email,
            "customer_phone": customer_phone,
        },
        "order_meta": {"return_url": return_url},
        "order_note": order_note,
    }
    async with httpx.AsyncClient() as http:
        response = await http.post(f"{base_url}/orders", headers=headers, json=payload, timeout=15)
        if response.status_code in (200, 201):
            return response.json()

        try:
            error = response.json()
        except ValueError:
            error = {}
        if response.status_code == 409 and error.get("code") == "order_already_exists":
            existing_response = await http.get(f"{base_url}/orders/{order_id}", headers=headers, timeout=15)
            if existing_response.status_code == 200:
                existing_order = existing_response.json()
                try:
                    existing_amount = round(float(existing_order.get("order_amount")), 2)
                except (TypeError, ValueError):
                    existing_amount = None
                if (
                    existing_order.get("order_id") == order_id
                    and existing_amount == round(amount, 2)
                    and str(existing_order.get("order_currency", "")).upper() == currency.upper()
                    and existing_order.get("order_status") == "ACTIVE"
                    and existing_order.get("payment_session_id")
                ):
                    return existing_order
            logger.error("Cashfree existing order recovery failed for %s", order_id)
            await on_unrecoverable_order()
            raise HTTPException(
                status_code=409,
                detail="A previous Cashfree payment attempt is no longer payable. Please start checkout again.",
            )

    logger.error("Cashfree order creation failed: %s", response.text)
    raise HTTPException(status_code=502, detail="Could not create Cashfree order")


async def _abandon_payment(payment: Payment, db: AsyncSession) -> None:
    payment.status = PaymentStatus.ABANDONED
    await db.commit()


def _valid_razorpay_signature(order_id: str, payment_id: str, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _paypal_access_token(client_id_str: str, client_secret: str, sandbox: bool) -> str:
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    auth = base64.b64encode(f"{client_id_str}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            f"{base_url}/v1/oauth2/token",
            headers={"Authorization": f"Basic {auth}"},
            data={"grant_type": "client_credentials"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def _get_country_specific_price(
    plan: ClientSubscriptionPlan, user_country: str | None
) -> tuple[float, str]:
    """
    Resolve the price and currency based on country-specific pricing.
    
    Industry Standard: Applies country-specific pricing if:
    1. Country-specific pricing is defined for the plan
    2. User has a country set
    3. The user's country matches one of the defined country prices
    
    Falls back to default plan price if no match found.
    
    Args:
        plan: ClientSubscriptionPlan with optional country_pricing
        user_country: ISO 3166-1 alpha-2 country code (e.g., 'IN', 'US', 'GB')
    
    Returns:
        Tuple of (price: float, currency: str)
    """
    # No country-specific pricing defined or user has no country
    if not plan.country_pricing or not user_country:
        return float(plan.price), plan.currency
    
    # Search for matching country in country_pricing list
    for country_price_item in plan.country_pricing:
        if country_price_item.get("country", "").upper() == user_country.upper():
            return (
                float(country_price_item.get("price", plan.price)),
                country_price_item.get("currency", plan.currency),
            )
    
    # No country match found, use default
    return float(plan.price), plan.currency


async def _calculate_checkout_tax(
    db: AsyncSession,
    client_id: uuid.UUID,
    subtotal: float,
) -> tuple[float, list[CheckoutTaxLine]]:
    taxes_result = await db.execute(
        select(ClientTax)
        .where(ClientTax.client_id == client_id, ClientTax.is_active.is_(True))
        .order_by(ClientTax.created_at.asc())
    )
    tax_lines = []
    for tax in taxes_result.scalars().all():
        is_flat = tax.tax_type == "flat"
        flat_amount = float(tax.flat_amount or 0) if is_flat else None
        tax_lines.append(CheckoutTaxLine(
            name=tax.name,
            tax_type=tax.tax_type,
            percentage=None if is_flat else float(tax.percentage),
            flat_amount=flat_amount,
            amount=round(flat_amount if is_flat else subtotal * float(tax.percentage) / 100, 2),
        ))
    return round(sum(tax.amount for tax in tax_lines), 2), tax_lines


@router.post("/tax-quote", response_model=CheckoutTaxQuoteResponse)
async def get_checkout_tax_quote(
    payload: CheckoutTaxQuoteRequest,
    request: Request,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the server-calculated checkout total before payment is initiated."""
    client = await _get_client(current_user._client_id, db)
    plan_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == payload.plan_id,
            ClientSubscriptionPlan.client_id == client.id,
            ClientSubscriptionPlan.is_active.is_(True),
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    country = await _checkout_country(current_user, request)
    subtotal, currency = _get_country_specific_price(plan, country)
    if payload.coupon_code:
        _, _, subtotal = await _validate_and_apply_coupon(
            db, client.id, current_user.id, plan.id, payload.coupon_code, subtotal, currency
        )
    tax_amount, tax_lines = await _calculate_checkout_tax(db, client.id, subtotal)
    return CheckoutTaxQuoteResponse(
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=round(subtotal + tax_amount, 2),
        currency=currency,
        tax_lines=tax_lines,
    )


async def _validate_and_apply_coupon(
    db: AsyncSession,
    client_id: uuid.UUID,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    coupon_code: str,
    amount: float,
    currency: str,
) -> tuple[Coupon | None, float, float]:
    """
    Validate and calculate coupon discount.
    
    Returns:
        (coupon, discount_amount, final_amount)
        Returns (None, 0, amount) if coupon is invalid
    """
    # Find coupon
    result = await db.execute(
        select(Coupon).where(
            Coupon.client_id == client_id,
            Coupon.code == coupon_code.strip().upper(),
        )
    )
    coupon = result.scalar_one_or_none()
    
    if not coupon:
        raise HTTPException(status_code=400, detail="Invalid coupon code")
    
    now = datetime.now(timezone.utc)
    
    # Check if coupon is active
    if not coupon.is_active:
        raise HTTPException(status_code=400, detail="Coupon is not active")

    if coupon.currency and coupon.currency.upper() != currency.upper():
        raise HTTPException(status_code=400, detail=f"This coupon is valid for {coupon.currency} only.")
    
    # Check validity period
    if coupon.valid_from:
        try:
            valid_from = datetime.fromisoformat(coupon.valid_from)
            if now < valid_from:
                raise HTTPException(status_code=400, detail="Coupon is not yet valid")
        except ValueError:
            pass
    
    if coupon.valid_until:
        try:
            valid_until = datetime.fromisoformat(coupon.valid_until)
            if now > valid_until:
                raise HTTPException(status_code=400, detail="Coupon has expired")
        except ValueError:
            pass
    
    # Check minimum amount
    if coupon.min_amount and amount < coupon.min_amount:
        raise HTTPException(
            status_code=400, 
            detail=f"Minimum purchase amount for this coupon is {coupon.min_amount}"
        )
    
    # Check total usage limit
    if coupon.max_uses and coupon.current_uses >= coupon.max_uses:
        raise HTTPException(status_code=400, detail="Coupon usage limit has been reached")
    
    # Check per-user usage limit
    if coupon.max_uses_per_user:
        user_usage_result = await db.execute(
            select(CouponUsage).where(
                CouponUsage.coupon_id == coupon.id,
                CouponUsage.user_id == user_id,
            )
        )
        user_usage_count = len(user_usage_result.scalars().all())
        if user_usage_count >= coupon.max_uses_per_user:
            raise HTTPException(
                status_code=400, 
                detail="You have reached the usage limit for this coupon"
            )
    
    # Check plan restrictions
    if coupon.applies_to_plan_ids:
        plan_ids_str = [str(p) for p in coupon.applies_to_plan_ids]
        if str(plan_id) not in plan_ids_str:
            raise HTTPException(
                status_code=400, 
                detail="This coupon is not applicable to the selected plan"
            )
    
    # Calculate discount
    if coupon.discount_type == "percentage":
        discount = amount * (float(coupon.discount_value) / 100)
        # Apply max discount cap if set
        if coupon.max_discount_amount and discount > float(coupon.max_discount_amount):
            discount = float(coupon.max_discount_amount)
    else:  # fixed_amount
        discount = min(float(coupon.discount_value), amount)
    
    final_amount = max(0, amount - discount)
    
    return coupon, discount, final_amount


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _expected_minor_units(amount: float) -> int:
    """Convert major-unit amount to gateway minor units (2-decimal currencies)."""
    return int(round(amount * 100))


def _add_months(anchor: datetime, months: int) -> datetime:
    total_months = (anchor.month - 1) + months
    year = anchor.year + total_months // 12
    month = (total_months % 12) + 1
    day = min(anchor.day, monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def _resolve_subscription_expiry(plan: ClientSubscriptionPlan, start: datetime) -> datetime | None:
    if plan.billing_cycle in (PlanBillingCycle.DAILY, PlanBillingCycle.WEEKLY):
        if plan.restriction_days and plan.restriction_days > 0:
            return start + timedelta(days=plan.restriction_days)
        if plan.restriction_hours_per_day and plan.restriction_hours_per_day > 0:
            return start + timedelta(hours=plan.restriction_hours_per_day)

    if plan.billing_cycle in (
        PlanBillingCycle.MONTHLY,
        PlanBillingCycle.QUARTERLY,
        PlanBillingCycle.YEARLY,
    ) and plan.restriction_months and plan.restriction_months > 0:
        return _add_months(start, plan.restriction_months)

    if plan.restriction_months and plan.restriction_months > 0:
        return _add_months(start, plan.restriction_months)

    if plan.restriction_days and plan.restriction_days > 0:
        return start + timedelta(days=plan.restriction_days)

    if plan.restriction_hours_per_day and plan.restriction_hours_per_day > 0:
        return start + timedelta(hours=plan.restriction_hours_per_day)

    days = BILLING_CYCLE_DAYS.get(plan.billing_cycle.value)
    return start + timedelta(days=days) if days else None


def _is_current_subscription_record(sub: UserSubscription, now: datetime) -> bool:
    if sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL):
        return False
    started_at = _parse_iso_datetime(sub.started_at)
    if started_at and started_at > now:
        return False
    expires_at = _parse_iso_datetime(sub.expires_at)
    if expires_at is None:
        return True
    return expires_at > now


async def _list_current_subscription_rows(
    db: AsyncSession,
    client_id: uuid.UUID,
    user_id: uuid.UUID,
    now: datetime,
) -> list[tuple[UserSubscription, ClientSubscriptionPlan]]:
    result = await db.execute(
        select(UserSubscription, ClientSubscriptionPlan)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .where(
            UserSubscription.client_id == client_id,
            UserSubscription.user_id == user_id,
            UserSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
        )
    )
    rows = result.all()
    current_rows = [
        (sub, current_plan)
        for sub, current_plan in rows
        if _is_current_subscription_record(sub, now)
    ]
    current_rows.sort(
        key=lambda row: (
            _parse_iso_datetime(row[0].started_at) or datetime.min.replace(tzinfo=timezone.utc),
            _parse_iso_datetime(row[0].expires_at) or datetime.max.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )
    return current_rows


async def _cancel_current_subscription_overlaps(
    db: AsyncSession,
    client_id: uuid.UUID,
    user_id: uuid.UUID,
    now: datetime,
    keep_subscription_id: uuid.UUID | None = None,
) -> list[uuid.UUID]:
    current_rows = await _list_current_subscription_rows(db, client_id, user_id, now)
    cancelled_ids: list[uuid.UUID] = []
    for sub, _plan in current_rows:
        if keep_subscription_id and sub.id == keep_subscription_id:
            continue
        sub.status = SubscriptionStatus.CANCELLED
        sub.cancelled_at = now.isoformat()
        cancelled_ids.append(sub.id)
    return cancelled_ids


def _build_subscription(
    plan: ClientSubscriptionPlan,
    client: Client,
    user,
    payment: Payment,
    content_id: uuid.UUID | None,
    start: datetime | None = None,
) -> UserSubscription:
    """
    Build a UserSubscription record appropriate for the plan type.

    ``start`` lets the caller chain a renewal off the current expiry:
    pass the existing subscription's expires_at so the new period begins
    exactly when the current one ends (queued renewal / stacking).
    PPV and Rent always start immediately regardless of ``start``.
    """
    now = datetime.now(timezone.utc)

    if plan.plan_type == PlanType.SUBSCRIPTION:
        chain_start = start if start and start > now else now
        expires_at = _resolve_subscription_expiry(plan, chain_start)
        expires = expires_at.isoformat() if expires_at else None
        return UserSubscription(
            client_id=client.id,
            user_id=user.id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            started_at=chain_start.isoformat(),
            expires_at=expires,
            auto_renew=expires is not None,
            content_id=content_id,
            payment_id=payment.id,
            executed_by="User",
        )

    if plan.plan_type == PlanType.PPV:
        days = plan.restriction_days or 1
        auto_renew = False
    else:  # RENT
        days = plan.restriction_days or 2
        auto_renew = False

    return UserSubscription(
        client_id=client.id,
        user_id=user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        started_at=now.isoformat(),
        expires_at=(now + timedelta(days=days)).isoformat(),
        auto_renew=auto_renew,
        content_id=content_id,
        payment_id=payment.id,
        executed_by="User",
    )


async def _has_any_subscription_history(
    db: AsyncSession,
    client_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """True when the user has ever held any subscription in this client tenant."""
    result = await db.execute(
        select(UserSubscription.id)
        .where(
            UserSubscription.client_id == client_id,
            UserSubscription.user_id == user_id,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _has_used_subscription_trial(
    db: AsyncSession,
    client_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        select(UserSubscription.id)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .where(
            UserSubscription.client_id == client_id,
            UserSubscription.user_id == user_id,
            UserSubscription.status == SubscriptionStatus.TRIAL,
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _user_has_saved_payment_method(client: Client, current_user) -> bool:
    """Live-check that a real, chargeable payment method is on file (not just a customer/vault id)."""
    if current_user.paypal_vault_id:
        return True
    if not current_user.stripe_customer_id:
        return False

    stripe_cfg, _ = _gateway_cfg(client)
    secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
    if not stripe_cfg.get("enabled", False) or not secret_key_encrypted:
        return False

    stripe.api_key = decrypt_secret(secret_key_encrypted)
    try:
        payment_methods = await asyncio.to_thread(
            stripe.PaymentMethod.list, customer=current_user.stripe_customer_id, type="card"
        )
    except Exception:
        logger.exception("Failed to check saved payment methods for user %s", current_user.id)
        return False
    return bool(payment_methods.data)


async def _start_trial_subscription(
    *,
    db: AsyncSession,
    plan: ClientSubscriptionPlan,
    client: Client,
    current_user,
) -> tuple[UserSubscription, Payment, str]:
    now = datetime.now(timezone.utc)
    payment = Payment(
        client_id=client.id,
        user_id=current_user.id,
        amount=0,
        currency=plan.currency,
        status=PaymentStatus.SUCCESS,
        payment_method=PaymentMethod.OTHER,
        reference_type=plan.plan_type.value,
        reference_id=str(plan.id),
        paid_at=now.isoformat(),
        gateway_transaction_id="trial-plan",
        notes=json.dumps({"content_id": None, "trial_start": True}),
    )
    db.add(payment)
    await db.flush()

    requires_payment_method = bool(getattr(plan, "trial_requires_active_payment_method", False))
    subscription = UserSubscription(
        client_id=client.id,
        user_id=current_user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.TRIAL,
        started_at=now.isoformat(),
        expires_at=(now + timedelta(days=plan.trial_days)).isoformat(),
        auto_renew=not requires_payment_method,
        content_id=None,
        payment_id=payment.id,
        executed_by="User",
    )
    db.add(subscription)

    invoice_number = f"INV-{now.strftime('%Y%m%d')}-{str(payment.id)[:8].upper()}"
    invoice = Invoice(
        client_id=client.id,
        user_id=current_user.id,
        payment_id=payment.id,
        invoice_number=invoice_number,
        amount=0,
        currency=plan.currency,
        tax_amount=0,
        issued_at=now.isoformat(),
    )
    db.add(invoice)
    await db.flush()
    await db.refresh(subscription)
    return subscription, payment, invoice_number


async def complete_payment(
    payment: Payment,
    plan: ClientSubscriptionPlan,
    client: Client,
    current_user,
    content_id: uuid.UUID | None,
    db: AsyncSession,
    transaction_id: str,
) -> tuple[UserSubscription, str]:
    """
    Mark payment SUCCESS, create UserSubscription + Invoice.
    Returns (subscription, invoice_number).
    """
    now = datetime.now(timezone.utc)

    payment.status = PaymentStatus.SUCCESS
    payment.paid_at = now.isoformat()
    payment.gateway_transaction_id = transaction_id

    notes = json.loads(payment.notes or "{}")
    tax_amount = float(notes.get("tax_amount") or 0)
    payment.tax_amount = tax_amount
    if payment.tax_snapshot is None:
        payment.tax_snapshot = notes.get("tax_lines") or []

    # ── If coupon was applied, record the usage ─────────────────────────────────
    if payment.coupon_id:
        coupon_result = await db.execute(
            select(Coupon).where(Coupon.id == payment.coupon_id)
        )
        coupon = coupon_result.scalar_one_or_none()
        if coupon:
            # Increment coupon usage count
            coupon.current_uses += 1
            
            # Record individual usage
            coupon_usage = CouponUsage(
                client_id=client.id,
                coupon_id=coupon.id,
                user_id=current_user.id,
                payment_id=payment.id,
                discount_amount=float(payment.discount_amount),
                original_amount=float(payment.original_amount or payment.amount),
                final_amount=float(payment.amount),
                used_at=now.isoformat(),
            )
            db.add(coupon_usage)

    # ── Upgrade: cancel old subscription and start new one immediately ─────────
    upgrade_from_id = notes.get("upgrade_from_sub_id")
    if upgrade_from_id and plan.plan_type == PlanType.SUBSCRIPTION:
        await _cancel_current_subscription_overlaps(
            db,
            client.id,
            current_user.id,
            now,
            keep_subscription_id=None,
        )
        # Upgrade starts immediately (no chaining)
        subscription = _build_subscription(plan, client, current_user, payment, content_id, start=now)
    else:
        # ── Renewal chaining: new period starts when the current one expires ───
        chain_start: datetime | None = None
        if plan.plan_type == PlanType.SUBSCRIPTION:
            latest_result = await db.execute(
                select(UserSubscription).where(
                    UserSubscription.client_id == client.id,
                    UserSubscription.user_id == current_user.id,
                    UserSubscription.plan_id == plan.id,
                    UserSubscription.status == SubscriptionStatus.ACTIVE,
                )
                .order_by(UserSubscription.expires_at.desc())
                .limit(1)
            )
            latest = latest_result.scalar_one_or_none()
            if latest and latest.expires_at:
                try:
                    latest_expiry = datetime.fromisoformat(latest.expires_at)
                    if latest_expiry > now:
                        chain_start = latest_expiry
                except ValueError:
                    pass
        subscription = _build_subscription(plan, client, current_user, payment, content_id, start=chain_start)

    db.add(subscription)

    # Get coupon code if coupon was applied
    coupon_code = None
    if payment.coupon_id:
        coupon_result = await db.execute(
            select(Coupon.code).where(Coupon.id == payment.coupon_id)
        )
        coupon_code = coupon_result.scalar_one_or_none()

    # Check if invoice already exists (idempotency for retries)
    existing_invoice_result = await db.execute(
        select(Invoice).where(Invoice.payment_id == payment.id)
    )
    invoice = existing_invoice_result.scalar_one_or_none()
    
    if not invoice:
        # Create new invoice
        invoice_number = f"INV-{now.strftime('%Y%m%d')}-{str(payment.id)[:8].upper()}"
        invoice = Invoice(
            client_id=client.id,
            user_id=current_user.id,
            payment_id=payment.id,
            invoice_number=invoice_number,
            amount=float(payment.amount),
            currency=payment.currency,
            tax_amount=tax_amount,
            issued_at=now.isoformat(),
            coupon_code=coupon_code,
            discount_amount=float(payment.discount_amount),
            original_amount=float(payment.original_amount) if payment.original_amount else None,
        )
        db.add(invoice)
        await db.flush()
        await db.refresh(invoice)
    else:
        invoice_number = invoice.invoice_number
    
    await db.refresh(subscription)

    # Build professional HTML email with client branding (Client → EndUser)
    cfg = dict(client.site_config) if client.site_config else {}
    logo_url = await get_client_logo_url(db, client.id)
    company_name = cfg.get("site_title") or client.slug or "StreamTVDepot"
    footer_text = await get_client_footer_text(cfg)
    
    body_text = (
        f"Hi {getattr(current_user, 'full_name', '') or 'there'},\n\n"
        "Your payment was received successfully.\n"
        f"Invoice: {invoice_number}\n"
        f"Amount: {payment.amount} {payment.currency}\n"
        f"Transaction ID: {transaction_id}\n\n"
        "Thank you for your purchase."
    )
    
    html_content = generate_professional_email_html(
        subject=f"Payment successful - {invoice_number}",
        body_text=body_text,
        logo_url=logo_url,
        company_name=company_name,
        footer_text=footer_text,
    )

    attachments = None
    if float(payment.amount) > 0:
        try:
            pdf = generate_billing_receipt_pdf(
                invoice_number=invoice_number,
                created_at=payment.created_at.isoformat() if payment.created_at else None,
                paid_at=payment.paid_at,
                amount=float(payment.amount),
                currency=payment.currency,
                tax_amount=tax_amount,
                status="paid",
                plan_name=plan.name,
                period_start=subscription.started_at,
                period_end=subscription.expires_at,
                transaction_id=transaction_id,
                payment_method=payment.payment_method.value,
                issuer_footer=company_name,
                logo_url=logo_url,
            )
            attachments = [(f"invoice-{invoice_number}.pdf", pdf.getvalue(), "pdf")]
        except Exception:
            logger.exception("Invoice PDF attachment generation failed for payment %s", payment.id)

    await send_system_email(
        db,
        event_key="payment_success",
        to_email=current_user.email,
        to_name=getattr(current_user, "full_name", None),
        subject=f"Payment successful - {invoice_number}",
        body_text=body_text,
        body_html=html_content,
        client_id=client.id,
        metadata={
            "payment_id": str(payment.id),
            "invoice_number": invoice_number,
            "plan_id": str(plan.id),
        },
        attachments=attachments,
    )

    return subscription, invoice_number


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/schedule-downgrade", response_model=ScheduleDowngradeResponse)
async def schedule_downgrade(
    payload: ScheduleDowngradeRequest,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Schedule a lower-priced subscription plan to take effect at the next renewal."""
    client = await _get_client(current_user._client_id, db)
    target_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == payload.new_plan_id,
            ClientSubscriptionPlan.client_id == client.id,
            ClientSubscriptionPlan.is_active.is_(True),
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
        )
    )
    target_plan = target_result.scalar_one_or_none()
    if not target_plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")

    now = datetime.now(timezone.utc)
    current_rows = await _list_current_subscription_rows(db, client.id, current_user.id, now)
    if not current_rows:
        raise HTTPException(status_code=409, detail="You do not have an active subscription to downgrade")

    current_subscription, current_plan = current_rows[0]
    if current_subscription.expires_at is None:
        raise HTTPException(status_code=409, detail="Lifetime subscriptions cannot be downgraded")
    if current_plan.id == target_plan.id:
        raise HTTPException(status_code=400, detail="You are already subscribed to this plan")

    current_price, _ = _get_country_specific_price(current_plan, current_user.country)
    target_price, target_currency = _get_country_specific_price(target_plan, current_user.country)
    if target_price >= current_price:
        raise HTTPException(status_code=400, detail="Target plan is not a downgrade")
    if current_price <= 0:
        raise HTTPException(status_code=400, detail="Your current plan is already free")

    try:
        start_at = datetime.fromisoformat(current_subscription.expires_at)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Current subscription expiry is invalid") from exc
    if start_at <= now:
        raise HTTPException(status_code=409, detail="Your current subscription has already expired")

    queued_result = await db.execute(
        select(UserSubscription.id).where(
            UserSubscription.client_id == client.id,
            UserSubscription.user_id == current_user.id,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
            UserSubscription.started_at > now.isoformat(),
        ).limit(1)
    )
    if queued_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="You already have a plan change scheduled")

    payment = Payment(
        client_id=client.id,
        user_id=current_user.id,
        amount=0,
        currency=target_currency,
        status=PaymentStatus.SUCCESS,
        payment_method=PaymentMethod.OTHER,
        reference_type=target_plan.plan_type.value,
        reference_id=str(target_plan.id),
        gateway_transaction_id="scheduled-downgrade",
        paid_at=now.isoformat(),
        notes=json.dumps({"scheduled_downgrade_from_sub_id": str(current_subscription.id)}),
    )
    db.add(payment)
    await db.flush()

    subscription = _build_subscription(
        target_plan, client, current_user, payment, content_id=None, start=start_at
    )
    db.add(subscription)
    invoice = Invoice(
        client_id=client.id,
        user_id=current_user.id,
        payment_id=payment.id,
        invoice_number=f"INV-{now.strftime('%Y%m%d')}-{str(payment.id)[:8].upper()}",
        amount=0,
        currency=target_currency,
        tax_amount=0,
        issued_at=now.isoformat(),
    )
    db.add(invoice)
    await db.commit()
    await db.refresh(subscription)

    return ScheduleDowngradeResponse(
        subscription_id=subscription.id,
        starts_at=subscription.started_at,
        expires_at=subscription.expires_at,
    )


# ── Payment method setup (save a card without charging) ──────────────────────

@router.post("/payment-method/setup-intent", response_model=PaymentMethodSetupResponse)
async def create_payment_method_setup_intent(
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Stripe SetupIntent so the user can save a card with no charge.

    Used before starting a trial plan that requires an active payment method
    (``trial_requires_active_payment_method``), or any time a user wants to
    add/replace their saved card ahead of a future auto-renewal charge.
    The frontend confirms the returned client_secret with Stripe.js
    (``stripe.confirmCardSetup``); Stripe attaches the resulting payment
    method to the customer automatically — no further backend call is needed.
    """
    client = await _get_client(current_user._client_id, db)
    stripe_cfg, _ = _gateway_cfg(client)
    if not stripe_cfg.get("enabled", False):
        raise HTTPException(status_code=400, detail="Stripe is not enabled on this platform")

    secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
    if not secret_key_encrypted:
        raise HTTPException(status_code=400, detail="Stripe secret key is not configured")

    stripe.api_key = decrypt_secret(secret_key_encrypted)

    if not current_user.stripe_customer_id:
        customer = await asyncio.to_thread(
            stripe.Customer.create,
            email=current_user.email,
            name=current_user.full_name or current_user.email,
            metadata={"user_id": str(current_user.id), "client_id": str(client.id)},
        )
        current_user.stripe_customer_id = customer.id
        await db.flush()
        await db.commit()

    setup_intent = await asyncio.to_thread(
        stripe.SetupIntent.create,
        customer=current_user.stripe_customer_id,
        payment_method_types=["card"],
        usage="off_session",
        metadata={
            "user_id": str(current_user.id),
            "client_id": str(client.id),
            "country": (current_user.country or current_user.billing_country or "").upper()[:2],
        },
    )

    return PaymentMethodSetupResponse(
        gateway="stripe",
        stripe_client_secret=setup_intent.client_secret,
        stripe_publishable_key=stripe_cfg.get("publishable_key"),
    )


@router.get("/payment-method/status", response_model=PaymentMethodStatusResponse)
async def get_payment_method_status(
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Return whether the current user has a real, chargeable saved payment method."""
    client = await _get_client(current_user._client_id, db)
    has_method = await _user_has_saved_payment_method(client, current_user)
    gateway = None
    if has_method:
        gateway = "paypal" if current_user.paypal_vault_id else "stripe"
    return PaymentMethodStatusResponse(has_payment_method=has_method, gateway=gateway)


@router.get("/payment-methods", response_model=SavedPaymentMethodsResponse)
async def list_payment_methods(
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """List safe metadata for the user's reusable payment methods."""
    client = await _get_client(current_user._client_id, db)
    stripe_cfg, _ = _gateway_cfg(client)
    saved_methods: list[SavedPaymentMethodOut] = []

    if current_user.stripe_customer_id and stripe_cfg.get("secret_key_encrypted"):
        stripe.api_key = decrypt_secret(stripe_cfg["secret_key_encrypted"])
        try:
            customer = await asyncio.to_thread(
                stripe.Customer.retrieve, current_user.stripe_customer_id
            )
            default_id = ((customer.get("invoice_settings") or {}).get("default_payment_method"))
            methods = await asyncio.to_thread(
                stripe.PaymentMethod.list,
                customer=current_user.stripe_customer_id,
                type="card",
            )
            if not default_id and methods.data:
                default_id = methods.data[0].id
            for method in methods.data:
                card = method.card
                saved_methods.append(
                    SavedPaymentMethodOut(
                        id=method.id,
                        gateway="stripe",
                        type="card",
                        brand=card.brand,
                        last4=card.last4,
                        exp_month=card.exp_month,
                        exp_year=card.exp_year,
                        is_default=method.id == default_id,
                    )
                )
        except Exception:
            logger.exception("Failed to list saved payment methods for user %s", current_user.id)

    return SavedPaymentMethodsResponse(
        payment_methods=saved_methods,
        paypal_connected=bool(current_user.paypal_vault_id),
    )


async def _get_owned_stripe_payment_method(current_user, client: Client, payment_method_id: str):
    stripe_cfg, _ = _gateway_cfg(client)
    if not current_user.stripe_customer_id or not stripe_cfg.get("secret_key_encrypted"):
        raise HTTPException(status_code=404, detail="Payment method not found")

    stripe.api_key = decrypt_secret(stripe_cfg["secret_key_encrypted"])
    try:
        method = await asyncio.to_thread(stripe.PaymentMethod.retrieve, payment_method_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Payment method not found")

    if method.customer != current_user.stripe_customer_id:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return stripe_cfg, method


@router.post("/payment-methods/{payment_method_id}/default", response_model=SavedPaymentMethodsResponse)
async def set_default_payment_method(
    payment_method_id: str,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Make an owned Stripe card the default off-session payment method."""
    client = await _get_client(current_user._client_id, db)
    _, method = await _get_owned_stripe_payment_method(current_user, client, payment_method_id)
    await asyncio.to_thread(
        stripe.Customer.modify,
        current_user.stripe_customer_id,
        invoice_settings={"default_payment_method": method.id},
    )
    return await list_payment_methods(current_user=current_user, db=db)


@router.delete("/payment-methods/{payment_method_id}", response_model=SavedPaymentMethodsResponse)
async def delete_payment_method(
    payment_method_id: str,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """Detach an owned Stripe card after confirming it is not the only card."""
    client = await _get_client(current_user._client_id, db)
    _, method = await _get_owned_stripe_payment_method(current_user, client, payment_method_id)
    customer = await asyncio.to_thread(
        stripe.Customer.retrieve, current_user.stripe_customer_id
    )
    current_default_id = ((customer.get("invoice_settings") or {}).get("default_payment_method"))
    methods = await asyncio.to_thread(
        stripe.PaymentMethod.list,
        customer=current_user.stripe_customer_id,
        type="card",
    )
    if len(methods.data) <= 1 and current_user.paypal_vault_id is None:
        raise HTTPException(status_code=409, detail="Add another payment method before removing this card")
    await asyncio.to_thread(stripe.PaymentMethod.detach, method.id)
    if current_default_id == method.id and len(methods.data) > 1:
        await asyncio.to_thread(
            stripe.Customer.modify,
            current_user.stripe_customer_id,
            invoice_settings={
                "default_payment_method": next(item.id for item in methods.data if item.id != method.id),
            },
        )
    return await list_payment_methods(current_user=current_user, db=db)


@router.post("/initiate", response_model=CheckoutInitiateResponse)
async def initiate_checkout(
    payload: CheckoutInitiateRequest,
    request: Request,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate a payment for a subscription, PPV, or rental plan.

    - gateway=null: auto-picks the enabled gateway; raises 400 if both are enabled
      (caller must specify which gateway to use).
    - content_id: required for PPV and Rent plans.
    """
    client = await _get_client(current_user._client_id, db)
    stripe_cfg, paypal_cfg = _gateway_cfg(client)
    razorpay_cfg = get_active_payment_gateway_config(client.site_config, "razorpay")
    cashfree_cfg = get_active_payment_gateway_config(client.site_config, "cashfree")
    stripe_enabled = stripe_cfg.get("enabled", False)
    paypal_enabled = paypal_cfg.get("enabled", False)
    razorpay_enabled = razorpay_cfg.get("enabled", False)
    cashfree_enabled = cashfree_cfg.get("enabled", False)

    # Load and validate plan
    plan_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == payload.plan_id,
            ClientSubscriptionPlan.client_id == client.id,
            ClientSubscriptionPlan.is_active.is_(True),
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if plan.plan_type in (PlanType.PPV, PlanType.RENT) and not payload.content_id:
        raise HTTPException(
            status_code=400,
            detail="content_id is required for PPV and Rent plans",
        )

    if plan.plan_type == PlanType.RENT:
        video = (await db.execute(
            select(Video).where(
                Video.id == payload.content_id,
                Video.client_id == client.id,
                Video.deleted_at.is_(None),
                Video.is_active.is_(True),
            )
        )).scalar_one_or_none()
        audio = None if video else (await db.execute(
            select(Audio).where(
                Audio.id == payload.content_id,
                Audio.client_id == client.id,
                Audio.deleted_at.is_(None),
                Audio.status == "published",
            )
        )).scalar_one_or_none()
        series = None if video or audio else (await db.execute(
            select(Series).where(
                Series.id == payload.content_id,
                Series.client_id == client.id,
                Series.deleted_at.is_(None),
                Series.status == "published",
            )
        )).scalar_one_or_none()
        content = video or audio or series
        if not content:
            raise HTTPException(status_code=404, detail="Rental content not found")
        configured_plan_ids = {str(plan_id) for plan_id in (content.subscription_plan_ids or [])}
        if str(plan.id) not in configured_plan_ids:
            raise HTTPException(
                status_code=409,
                detail="This rental plan is not available for the selected content.",
            )
    elif plan.plan_type == PlanType.PPV:
        event_result = await db.execute(
            select(PPVEvent).where(
                PPVEvent.id == payload.content_id,
                PPVEvent.client_id == client.id,
                PPVEvent.pricing_plan_id == plan.id,
                PPVEvent.is_active.is_(True),
            )
        )
        if not event_result.scalar_one_or_none():
            audio = (await db.execute(
                select(Audio).where(
                    Audio.id == payload.content_id,
                    Audio.client_id == client.id,
                    Audio.deleted_at.is_(None),
                    Audio.status == "published",
                )
            )).scalar_one_or_none()
            series = None if audio else (await db.execute(
                select(Series).where(
                    Series.id == payload.content_id,
                    Series.client_id == client.id,
                    Series.deleted_at.is_(None),
                    Series.status == "published",
                )
            )).scalar_one_or_none()
            content = audio or series
            if not content or str(plan.id) not in {str(plan_id) for plan_id in (content.subscription_plan_ids or [])}:
                raise HTTPException(status_code=404, detail="PPV content not found for this plan")

    now_iso = datetime.now(timezone.utc).isoformat()

    # ── Subscription: allow renewal queuing, but prevent double-queuing ────────
    if plan.plan_type == PlanType.SUBSCRIPTION:
        now_utc = datetime.now(timezone.utc)
        current_rows = await _list_current_subscription_rows(
            db,
            client.id,
            current_user.id,
            now_utc,
        )
        effective_current = current_rows[0] if current_rows else None
        if effective_current and effective_current[1].id != plan.id:
            raise HTTPException(
                status_code=409,
                detail=(
                    "You already have an active subscription on a different plan. "
                    "Use upgrade to switch plans or wait until renewal."
                ),
            )
        if effective_current and effective_current[1].id == plan.id and effective_current[0].expires_at is None:
            raise HTTPException(
                status_code=409,
                detail="You already have lifetime access to this subscription plan.",
            )
        # Block only if there is already a future-dated (queued) renewal pending
        queued_result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.client_id == client.id,
                UserSubscription.user_id == current_user.id,
                UserSubscription.status == SubscriptionStatus.ACTIVE,
                UserSubscription.plan_id == plan.id,
                UserSubscription.started_at > now_utc.isoformat(),
            )
        )
        if queued_result.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="You already have a renewal queued for this plan.",
            )

    # ── PPV / Rent: prevent buying the same content twice ─────────────────────
    if plan.plan_type in (PlanType.PPV, PlanType.RENT) and payload.content_id:
        dup_result = await db.execute(
            select(UserSubscription).where(
                UserSubscription.client_id == client.id,
                UserSubscription.user_id == current_user.id,
                UserSubscription.plan_id == plan.id,
                UserSubscription.content_id == payload.content_id,
                UserSubscription.status == SubscriptionStatus.ACTIVE,
            )
        )
        dup = dup_result.scalar_one_or_none()
        if dup:
            label = "PPV event" if plan.plan_type == PlanType.PPV else "rental"
            raise HTTPException(
                status_code=409,
                detail=f"You already have active access to this {label}.",
            )

    # ── Resolve country-specific pricing ──────────────────────────────────────
    # Prefer the profile country, then securely resolve the visitor's location
    # server-side when the profile has not collected it yet.
    user_country = await _checkout_country(current_user, request)
    amount, currency = _get_country_specific_price(plan, user_country)
    original_amount = amount
    discount_amount = 0.0
    coupon_applied = False
    applied_coupon = None
    
    # ── Validate and apply coupon if provided ─────────────────────────────────
    if payload.coupon_code:
        try:
            applied_coupon, discount_amount, amount = await _validate_and_apply_coupon(
                db,
                client.id,
                current_user.id,
                plan.id,
                payload.coupon_code,
                amount,
                currency,
            )
            coupon_applied = True
        except HTTPException:
            # Re-raise coupon validation errors
            raise
    
    subtotal = amount
    tax_amount, tax_lines = await _calculate_checkout_tax(db, client.id, subtotal)
    amount = round(subtotal + tax_amount, 2)
    payment_notes = json.dumps({
        "content_id": str(payload.content_id) if payload.content_id else None,
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "tax_lines": [tax_line.model_dump() for tax_line in tax_lines],
    })

    # ── One-time trial start for paid subscription plans ─────────────────────
    if (
        plan.plan_type == PlanType.SUBSCRIPTION
        and float(amount) > 0
        and int(plan.trial_days or 0) > 0
        and not payload.skip_trial
    ):
        has_prior_subscription = await _has_any_subscription_history(db, client.id, current_user.id)
        if has_prior_subscription:
            # Existing users always pay the plan amount; trial is reserved for true first-time subscribers.
            pass
        else:
            if getattr(plan, "trial_requires_active_payment_method", False):
                if not await _user_has_saved_payment_method(client, current_user):
                    raise HTTPException(
                        status_code=400,
                        detail="Add a payment method before starting this trial. The plan will be charged automatically after the trial ends.",
                    )

            already_used_trial = await _has_used_subscription_trial(db, client.id, current_user.id)
            if already_used_trial:
                raise HTTPException(
                    status_code=409,
                    detail="Trial has already been used for this user account.",
                )

            subscription, payment, invoice_number = await _start_trial_subscription(
                db=db,
                plan=plan,
                client=client,
                current_user=current_user,
            )
            await db.commit()

            return CheckoutInitiateResponse(
                payment_id=payment.id,
                gateway="free",
                amount=0,
                currency=plan.currency,
                coupon_applied=coupon_applied,
                original_amount=original_amount if coupon_applied else None,
                discount_amount=discount_amount if coupon_applied else None,
                subscription_id=subscription.id,
                invoice_number=invoice_number,
            )

        # If the user has a prior subscription history, the trial does not apply.
        # Continue through the normal paid checkout flow below.

    if amount <= 0:
        payment = Payment(
            client_id=client.id,
            user_id=current_user.id,
            amount=0,
            currency=currency,
            coupon_id=applied_coupon.id if applied_coupon else None,
            discount_amount=discount_amount,
            original_amount=original_amount if coupon_applied else subtotal,
            status=PaymentStatus.PENDING,
            payment_method=PaymentMethod.OTHER,
            reference_type=plan.plan_type.value,
            reference_id=str(plan.id),
            notes=payment_notes,
        )
        db.add(payment)
        await db.flush()
        await db.refresh(payment)

        subscription, invoice_number = await complete_payment(
            payment,
            plan,
            client,
            current_user,
            payload.content_id,
            db,
            transaction_id="free-plan",
        )
        await db.commit()

        return CheckoutInitiateResponse(
            payment_id=payment.id,
            gateway="free",
            amount=0,
            currency=currency,
            coupon_applied=coupon_applied,
            original_amount=original_amount if coupon_applied else None,
            discount_amount=discount_amount if coupon_applied else None,
            subscription_id=subscription.id,
            invoice_number=invoice_number,
        )

    if not any((stripe_enabled, paypal_enabled, razorpay_enabled, cashfree_enabled)):
        raise HTTPException(status_code=400, detail="No payment gateway is configured for this platform")

    gateway = payload.gateway
    if gateway is None:
        enabled_gateways = [name for name, enabled in (
            ("stripe", stripe_enabled),
            ("paypal", paypal_enabled),
            ("razorpay", razorpay_enabled),
            ("cashfree", cashfree_enabled),
        ) if enabled]
        if len(enabled_gateways) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"Multiple payment gateways are available. Please specify one of: {', '.join(enabled_gateways)}.",
            )
        gateway = enabled_gateways[0]

    if gateway == "stripe" and not stripe_enabled:
        raise HTTPException(status_code=400, detail="Stripe is not enabled on this platform")
    if gateway == "paypal" and not paypal_enabled:
        raise HTTPException(status_code=400, detail="PayPal is not enabled on this platform")
    if gateway == "razorpay" and not razorpay_enabled:
        raise HTTPException(status_code=400, detail="Razorpay is not enabled on this platform")
    if gateway == "cashfree" and not cashfree_enabled:
        raise HTTPException(status_code=400, detail="Cashfree is not enabled on this platform")
    cashfree_phone = _cashfree_customer_phone(current_user) if gateway == "cashfree" else None

    payment_methods = {
        "stripe": PaymentMethod.STRIPE,
        "paypal": PaymentMethod.PAYPAL,
        "razorpay": PaymentMethod.RAZORPAY,
        "cashfree": PaymentMethod.CASHFREE,
    }
    payment_method = payment_methods[gateway]

    # ── Reuse or create payment record ───────────────────────────────────────
    # Check if there's already a PENDING payment for this user/plan
    existing_pending_result = await db.execute(
        select(Payment).where(
            Payment.client_id == client.id,
            Payment.user_id == current_user.id,
            Payment.reference_type == plan.plan_type.value,
            Payment.reference_id == str(plan.id),
            Payment.status == PaymentStatus.PENDING,
            Payment.payment_method == payment_method,
        )
    )
    payment = next(
        (
            candidate
            for candidate in existing_pending_result.scalars()
            if json.loads(candidate.notes or "{}").get("content_id")
            == (str(payload.content_id) if payload.content_id else None)
        ),
        None,
    )

    if payment:
        # Update existing payment with new coupon/amount information
        payment.coupon_id = applied_coupon.id if applied_coupon else None
        payment.discount_amount = discount_amount
        payment.original_amount = original_amount if coupon_applied else subtotal
        payment.tax_amount = tax_amount
        payment.tax_snapshot = [tax_line.model_dump() for tax_line in tax_lines]
        payment.amount = amount
        payment.currency = currency
        payment.notes = payment_notes
        await db.flush()
        await db.refresh(payment)
    else:
        # Create new payment record
        payment = Payment(
            client_id=client.id,
            coupon_id=applied_coupon.id if applied_coupon else None,
            discount_amount=discount_amount,
            original_amount=original_amount if coupon_applied else subtotal,
            tax_amount=tax_amount,
            tax_snapshot=[tax_line.model_dump() for tax_line in tax_lines],
            user_id=current_user.id,
            amount=amount,
            currency=currency,
            status=PaymentStatus.PENDING,
            payment_method=payment_method,
            reference_type=plan.plan_type.value,
            reference_id=str(plan.id),
            # Store content_id in notes so confirm can reconstruct it
            notes=payment_notes,
        )
        db.add(payment)
        await db.flush()
        await db.refresh(payment)

    # ── Stripe ────────────────────────────────────────────────────────────────
    if gateway == "stripe":
        secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
        if not secret_key_encrypted:
            raise HTTPException(status_code=400, detail="Stripe secret key is not configured")

        stripe.api_key = decrypt_secret(secret_key_encrypted)
        stripe_payment_method_id = payload.payment_method_id
        stripe_customer_id = current_user.stripe_customer_id
        if stripe_payment_method_id:
            if not stripe_customer_id:
                raise HTTPException(status_code=404, detail="Saved payment method not found")
            try:
                saved_method = await asyncio.to_thread(
                    stripe.PaymentMethod.retrieve, stripe_payment_method_id
                )
            except Exception:
                raise HTTPException(status_code=404, detail="Saved payment method not found")
            if saved_method.customer != stripe_customer_id or saved_method.type != "card":
                raise HTTPException(status_code=404, detail="Saved payment method not found")
            billing_country = (current_user.billing_country or current_user.country or "").upper()[:2]
            if billing_country:
                await asyncio.to_thread(
                    stripe.PaymentMethod.modify,
                    saved_method.id,
                    billing_details={
                        "address": {"country": billing_country},
                    },
                )

        # Recurring subscriptions: create/reuse a Stripe Customer and save the
        # card off-session so auto-renewal can charge it without user action.
        save_payment_method = plan.plan_type == PlanType.SUBSCRIPTION
        if save_payment_method and not current_user.stripe_customer_id:
            customer = await asyncio.to_thread(
                stripe.Customer.create,
                email=current_user.email,
                name=current_user.full_name or current_user.email,
                metadata={"user_id": str(current_user.id), "client_id": str(client.id)},
            )
            current_user.stripe_customer_id = customer.id
            stripe_customer_id = customer.id
            await db.flush()

        plan_type_label = {"subscription": "Subscription", "rent": "Rental", "ppv": "Pay-Per-View"}.get(
            plan.plan_type.value, plan.plan_type.value.capitalize()
        )
        # Build shipping/billing address for India export compliance.
        # Use the user's saved billing address when available; otherwise fall back
        # to their profile country so Stripe's requirement is always satisfied.
        has_billing = bool(current_user.billing_line1 and current_user.billing_country)
        billing_address = {
            "line1": current_user.billing_line1 if has_billing else ".",
            "line2": current_user.billing_line2 or None,
            "city": current_user.billing_city or None,
            "state": current_user.billing_state or None,
            "postal_code": current_user.billing_postal_code or None,
            "country": (
                (current_user.billing_country or current_user.country or "IN").upper()[:2]
            ),
        }
        # Update existing PaymentIntent or create new one
        if payment.gateway_order_id:
            try:
                intent = await asyncio.to_thread(
                    stripe.PaymentIntent.modify,
                    payment.gateway_order_id,
                    amount=max(1, int(amount * 100)),
                    currency=currency.lower(),
                    description=f"{plan_type_label}: {plan.name}",
                    receipt_email=current_user.email,
                    metadata={
                        "payment_id": str(payment.id),
                        "plan_id": str(plan.id),
                        "client_id": str(client.id),
                        "user_id": str(current_user.id),
                        "coupon_code": applied_coupon.code if applied_coupon else None,
                        "discount_amount": str(discount_amount) if discount_amount else None,
                    },
                    **(
                        {
                            **({"customer": stripe_customer_id} if stripe_customer_id else {}),
                            **({"payment_method": stripe_payment_method_id} if stripe_payment_method_id else {}),
                            **({"setup_future_usage": "off_session"} if save_payment_method else {}),
                        }
                        if stripe_customer_id or stripe_payment_method_id else {}
                    ),
                )
            except stripe.error.InvalidRequestError:
                # PaymentIntent might be in a state that can't be modified, create new one
                intent = await asyncio.to_thread(
                    stripe.PaymentIntent.create,
                    amount=max(1, int(amount * 100)),
                    currency=currency.lower(),
                    description=f"{plan_type_label}: {plan.name}",
                    receipt_email=current_user.email,
                    shipping={
                        "name": current_user.full_name or current_user.email,
                        "address": billing_address,
                    },
                    metadata={
                        "payment_id": str(payment.id),
                        "plan_id": str(plan.id),
                        "client_id": str(client.id),
                        "user_id": str(current_user.id),
                        "coupon_code": applied_coupon.code if applied_coupon else None,
                        "discount_amount": str(discount_amount) if discount_amount else None,
                    },
                    **(
                        {
                            **({"customer": stripe_customer_id} if stripe_customer_id else {}),
                            **({"payment_method": stripe_payment_method_id} if stripe_payment_method_id else {}),
                            **({"setup_future_usage": "off_session"} if save_payment_method else {}),
                        }
                        if stripe_customer_id or stripe_payment_method_id else {}
                    ),
                )
                payment.gateway_order_id = intent.id
                await db.flush()
        else:
            intent = await asyncio.to_thread(
                stripe.PaymentIntent.create,
                amount=max(1, int(amount * 100)),
                currency=currency.lower(),
                description=f"{plan_type_label}: {plan.name}",
                receipt_email=current_user.email,
                shipping={
                    "name": current_user.full_name or current_user.email,
                    "address": billing_address,
                },
                metadata={
                    "payment_id": str(payment.id),
                    "plan_id": str(plan.id),
                    "client_id": str(client.id),
                    "user_id": str(current_user.id),
                    "coupon_code": applied_coupon.code if applied_coupon else None,
                    "discount_amount": str(discount_amount) if discount_amount else None,
                },
                **(
                    {
                        **({"customer": stripe_customer_id} if stripe_customer_id else {}),
                        **({"payment_method": stripe_payment_method_id} if stripe_payment_method_id else {}),
                        **({"setup_future_usage": "off_session"} if save_payment_method else {}),
                    }
                    if stripe_customer_id or stripe_payment_method_id else {}
                ),
            )
            payment.gateway_order_id = intent.id
            await db.flush()

        return CheckoutInitiateResponse(
            payment_id=payment.id,
            gateway="stripe",
            amount=amount,
            currency=currency,
            coupon_applied=coupon_applied,
            original_amount=original_amount if coupon_applied else None,
            discount_amount=discount_amount if coupon_applied else None,
            stripe_client_secret=intent.client_secret,
        )

    # ── Razorpay ─────────────────────────────────────────────────────────────
    if gateway == "razorpay":
        key_id = razorpay_cfg.get("key_id")
        key_secret_encrypted = razorpay_cfg.get("key_secret_encrypted")
        if not key_id or not key_secret_encrypted:
            raise HTTPException(status_code=400, detail="Razorpay credentials are not configured")

        key_secret = decrypt_secret(key_secret_encrypted)
        async with httpx.AsyncClient() as http:
            if payment.gateway_order_id:
                resp = await http.get(
                    f"https://api.razorpay.com/v1/orders/{payment.gateway_order_id}",
                    auth=(key_id, key_secret),
                    timeout=15,
                )
                if resp.status_code == 200:
                    order = resp.json()
                    if (
                        order.get("status") == "created"
                        and int(order.get("amount", 0)) == _expected_minor_units(amount)
                        and str(order.get("currency", "")).upper() == currency.upper()
                    ):
                        return CheckoutInitiateResponse(
                            payment_id=payment.id,
                            gateway="razorpay",
                            amount=amount,
                            currency=currency,
                            coupon_applied=coupon_applied,
                            original_amount=original_amount if coupon_applied else None,
                            discount_amount=discount_amount if coupon_applied else None,
                            razorpay_order_id=order["id"],
                            razorpay_key_id=key_id,
                        )
                payment.status = PaymentStatus.ABANDONED
                await db.commit()
                raise HTTPException(
                    status_code=409,
                    detail="A previous Razorpay payment attempt cannot be reused. Please start checkout again.",
                )

            resp = await http.post(
                "https://api.razorpay.com/v1/orders",
                auth=(key_id, key_secret),
                json={
                    "amount": _expected_minor_units(amount),
                    "currency": currency.upper(),
                    "receipt": str(payment.id),
                    "notes": {
                        "payment_id": str(payment.id),
                        "client_id": str(client.id),
                        "plan_id": str(plan.id),
                    },
                },
                timeout=15,
            )
        if resp.status_code not in (200, 201):
            logger.error("Razorpay order creation failed: %s", resp.text)
            raise HTTPException(status_code=502, detail="Could not create Razorpay order")
        order = resp.json()

        payment.gateway_order_id = order["id"]
        await db.flush()
        return CheckoutInitiateResponse(
            payment_id=payment.id,
            gateway="razorpay",
            amount=amount,
            currency=currency,
            coupon_applied=coupon_applied,
            original_amount=original_amount if coupon_applied else None,
            discount_amount=discount_amount if coupon_applied else None,
            razorpay_order_id=order["id"],
            razorpay_key_id=key_id,
        )

    # ── Cashfree ─────────────────────────────────────────────────────────────
    if gateway == "cashfree":
        app_id = cashfree_cfg.get("app_id")
        app_secret_encrypted = cashfree_cfg.get("app_secret_encrypted")
        if not app_id or not app_secret_encrypted:
            raise HTTPException(status_code=400, detail="Cashfree credentials are not configured")

        app_secret = decrypt_secret(app_secret_encrypted)
        cashfree_order_id = f"sv_{payment.id.hex}"
        cashfree_mode = cashfree_cfg.get("mode", "test")
        await db.commit()
        order = await _create_or_recover_cashfree_order(
            app_id=app_id,
            app_secret=app_secret,
            mode=cashfree_mode,
            order_id=cashfree_order_id,
            amount=amount,
            currency=currency,
            customer_id=str(current_user.id),
            customer_name=current_user.full_name or current_user.email,
            customer_email=current_user.email,
            customer_phone=cashfree_phone,
            return_url=_cashfree_return_url(client, request, payment.id),
            order_note=plan.name,
            on_unrecoverable_order=lambda: _abandon_payment(payment, db),
        )

        payment.gateway_order_id = order.get("order_id", cashfree_order_id)
        await db.flush()
        await db.commit()
        return CheckoutInitiateResponse(
            payment_id=payment.id,
            gateway="cashfree",
            amount=amount,
            currency=currency,
            coupon_applied=coupon_applied,
            original_amount=original_amount if coupon_applied else None,
            discount_amount=discount_amount if coupon_applied else None,
            cashfree_order_id=payment.gateway_order_id,
            cashfree_payment_session_id=order.get("payment_session_id"),
            cashfree_mode=cashfree_mode,
        )

    # ── PayPal ────────────────────────────────────────────────────────────────
    pp_client_id = paypal_cfg.get("client_id")
    pp_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
    if not pp_client_id or not pp_secret_encrypted:
        raise HTTPException(status_code=400, detail="PayPal credentials are not configured")

    pp_secret = decrypt_secret(pp_secret_encrypted)
    sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"

    access_token = await _paypal_access_token(pp_client_id, pp_secret, sandbox)

    async with httpx.AsyncClient() as http:
        resp = await http.post(
            f"{base_url}/v2/checkout/orders",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "intent": "CAPTURE",
                "purchase_units": [
                    {
                        "reference_id": str(payment.id),
                        "amount": {
                            "currency_code": currency.upper(),
                            "value": f"{amount:.2f}",
                        },
                        "description": plan.name,
                    }
                ],
                **(
                    {
                        "payment_source": {
                            "paypal": {
                                # Request vault token on approval for future
                                # off-session subscription renewal charges
                                "attributes": {
                                    "vault": {
                                        "store_in_vault": "ON_SUCCESS",
                                        "usage_type": "MERCHANT",
                                        "customer_type": "CONSUMER",
                                    }
                                },
                            }
                        }
                    }
                    if plan.plan_type == PlanType.SUBSCRIPTION else {}
                ),
            },
            timeout=15,
        )
        resp.raise_for_status()
        order = resp.json()

    order_id = order["id"]
    approval_url = next(
        (link["href"] for link in order.get("links", []) if link["rel"] == "approve"),
        None,
    )

    payment.gateway_order_id = order_id
    await db.flush()

    return CheckoutInitiateResponse(
        payment_id=payment.id,
        gateway="paypal",
        amount=amount,
        currency=currency,
        coupon_applied=coupon_applied,
        original_amount=original_amount if coupon_applied else None,
        discount_amount=discount_amount if coupon_applied else None,
        paypal_order_id=order_id,
        paypal_approval_url=approval_url,
    )


@router.post("/validate-coupon", response_model=CouponValidateResponse)
async def validate_coupon(
    payload: CouponValidateRequest,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate a coupon code without creating a payment.
    Returns discount information if valid, or error message if invalid.
    """
    client = await _get_client(current_user._client_id, db)
    
    # Find plan
    plan_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == payload.plan_id,
            ClientSubscriptionPlan.client_id == client.id,
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return CouponValidateResponse(
            valid=False,
            message="Plan not found",
        )

    _, currency = _get_country_specific_price(plan, current_user.country)
    
    try:
        applied_coupon, discount_amount, final_amount = await _validate_and_apply_coupon(
            db,
            client.id,
            current_user.id,
            plan.id,
            payload.coupon_code,
            payload.amount,
            currency,
        )
        
        # Calculate discount percentage
        discount_percentage = None
        if payload.amount > 0:
            discount_percentage = (discount_amount / payload.amount) * 100
        
        return CouponValidateResponse(
            valid=True,
            message="Coupon applied successfully",
            discount_amount=discount_amount,
            final_amount=final_amount,
            discount_percentage=discount_percentage,
        )
    except HTTPException as e:
        return CouponValidateResponse(
            valid=False,
            message=e.detail,
        )


@router.post("/confirm", response_model=CheckoutConfirmResponse)
async def confirm_checkout(
    payload: CheckoutConfirmRequest,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Confirm payment after user completes it on the frontend.

    - Stripe: pass stripe_payment_intent_id; we verify status with Stripe API.
    - PayPal: pass paypal_order_id + paypal_payer_id; we capture the order.
    """
    client = await _get_client(current_user._client_id, db)

    # Lock the payment row so concurrent/duplicate confirm calls (double-submit,
    # retry after slow response, etc.) serialize instead of racing each other
    # into complete_payment() and inserting two invoices for the same payment.
    payment_result = await db.execute(
        select(Payment)
        .where(
            Payment.id == payload.payment_id,
            Payment.user_id == current_user.id,
            Payment.client_id == client.id,
        )
        .with_for_update()
    )
    payment = payment_result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status == PaymentStatus.SUCCESS:
        # Idempotent — look up and return the existing subscription
        sub_result = await db.execute(
            select(UserSubscription).where(UserSubscription.payment_id == payment.id)
        )
        sub = sub_result.scalar_one_or_none()
        inv_result = await db.execute(
            select(Invoice).where(Invoice.payment_id == payment.id)
        )
        inv = inv_result.scalar_one_or_none()
        if sub and inv:
            return CheckoutConfirmResponse(
                success=True,
                subscription_id=sub.id,
                invoice_number=inv.invoice_number,
            )
        raise HTTPException(status_code=409, detail="Payment already completed")
    if payment.status == PaymentStatus.FAILED:
        raise HTTPException(status_code=400, detail="Payment has failed and cannot be confirmed")

    # Retrieve plan and content_id from payment record
    plan_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == uuid.UUID(payment.reference_id),
            ClientSubscriptionPlan.client_id == client.id,
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Associated plan not found")

    notes = json.loads(payment.notes or "{}")
    content_id_str = notes.get("content_id")
    content_id = uuid.UUID(content_id_str) if content_id_str else None

    stripe_cfg, paypal_cfg = _gateway_cfg(client)
    razorpay_cfg = get_active_payment_gateway_config(client.site_config, "razorpay")
    cashfree_cfg = get_active_payment_gateway_config(client.site_config, "cashfree")

    # ── Stripe confirmation ───────────────────────────────────────────────────
    if payment.payment_method == PaymentMethod.STRIPE:
        if not payload.stripe_payment_intent_id:
            raise HTTPException(status_code=400, detail="stripe_payment_intent_id is required")

        secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
        if not secret_key_encrypted:
            raise HTTPException(status_code=400, detail="Stripe is not configured")

        stripe.api_key = decrypt_secret(secret_key_encrypted)

        intent = await asyncio.to_thread(
            stripe.PaymentIntent.retrieve,
            payload.stripe_payment_intent_id,
        )

        if payment.gateway_order_id and intent.id != payment.gateway_order_id:
            raise HTTPException(status_code=400, detail="Payment intent does not match the pending payment")
        if str(intent.metadata.get("payment_id", "")) != str(payment.id):
            raise HTTPException(status_code=400, detail="Payment metadata mismatch")

        expected_minor = _expected_minor_units(float(payment.amount))
        paid_minor = int(intent.amount_received or intent.amount or 0)
        if paid_minor != expected_minor:
            raise HTTPException(status_code=400, detail="Paid amount does not match the pending payment")
        if str(intent.currency or "").upper() != str(payment.currency or "").upper():
            raise HTTPException(status_code=400, detail="Payment currency does not match the pending payment")

        if intent.status != "succeeded":
            payment.status = PaymentStatus.FAILED
            await db.flush()
            raise HTTPException(status_code=400, detail=f"Payment not successful (status: {intent.status})")

        # Persist the Stripe Customer for future off-session auto-renewal charges
        if intent.customer and not current_user.stripe_customer_id:
            current_user.stripe_customer_id = str(intent.customer)

        subscription, invoice_number = await complete_payment(
            payment, plan, client, current_user, content_id, db, intent.id
        )

    # ── Razorpay confirmation ──────────────────────────────────────────────────
    elif payment.payment_method == PaymentMethod.RAZORPAY:
        if not payload.razorpay_order_id or not payload.razorpay_payment_id or not payload.razorpay_signature:
            raise HTTPException(status_code=400, detail="Razorpay confirmation fields are required")
        if payment.gateway_order_id != payload.razorpay_order_id:
            raise HTTPException(status_code=400, detail="Razorpay order does not match the pending payment")

        key_id = razorpay_cfg.get("key_id")
        key_secret_encrypted = razorpay_cfg.get("key_secret_encrypted")
        if not key_id or not key_secret_encrypted:
            raise HTTPException(status_code=400, detail="Razorpay is not configured")
        key_secret = decrypt_secret(key_secret_encrypted)
        if not _valid_razorpay_signature(
            payload.razorpay_order_id,
            payload.razorpay_payment_id,
            payload.razorpay_signature,
            key_secret,
        ):
            raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

        async with httpx.AsyncClient() as http:
            resp = await http.get(
                f"https://api.razorpay.com/v1/payments/{payload.razorpay_payment_id}",
                auth=(key_id, key_secret),
                timeout=15,
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Could not verify Razorpay payment")
        payment_data = resp.json()
        if payment_data.get("order_id") != payment.gateway_order_id:
            raise HTTPException(status_code=400, detail="Razorpay payment order mismatch")
        if int(payment_data.get("amount", 0)) != _expected_minor_units(float(payment.amount)):
            raise HTTPException(status_code=400, detail="Paid amount does not match the pending payment")
        if str(payment_data.get("currency", "")).upper() != str(payment.currency or "").upper():
            raise HTTPException(status_code=400, detail="Payment currency does not match the pending payment")
        if payment_data.get("status") != "captured":
            raise HTTPException(status_code=409, detail="Razorpay payment is not captured yet")

        subscription, invoice_number = await complete_payment(
            payment, plan, client, current_user, content_id, db, payload.razorpay_payment_id
        )

    # ── Cashfree confirmation ─────────────────────────────────────────────────
    elif payment.payment_method == PaymentMethod.CASHFREE:
        cashfree_order_id = payload.cashfree_order_id or payment.gateway_order_id
        if not cashfree_order_id or cashfree_order_id != payment.gateway_order_id:
            raise HTTPException(status_code=400, detail="Cashfree order does not match the pending payment")

        app_id = cashfree_cfg.get("app_id")
        app_secret_encrypted = cashfree_cfg.get("app_secret_encrypted")
        if not app_id or not app_secret_encrypted:
            raise HTTPException(status_code=400, detail="Cashfree is not configured")
        app_secret = decrypt_secret(app_secret_encrypted)
        cashfree_mode = cashfree_cfg.get("mode", "test")
        headers = {
            "x-client-id": app_id,
            "x-client-secret": app_secret,
            "x-api-version": "2023-08-01",
        }
        async with httpx.AsyncClient() as http:
            order_resp = await http.get(
                f"{_cashfree_base_url(cashfree_mode)}/orders/{cashfree_order_id}",
                headers=headers,
                timeout=15,
            )
            payments_resp = await http.get(
                f"{_cashfree_base_url(cashfree_mode)}/orders/{cashfree_order_id}/payments",
                headers=headers,
                timeout=15,
            )
        if order_resp.status_code != 200 or payments_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Could not verify Cashfree payment")

        order_data = order_resp.json()
        if order_data.get("order_status") != "PAID":
            raise HTTPException(status_code=409, detail="Cashfree order is not paid yet")
        successful_payment = next(
            (item for item in payments_resp.json() if item.get("payment_status") == "SUCCESS"),
            None,
        )
        if not successful_payment:
            raise HTTPException(status_code=400, detail="Cashfree payment was not successful")
        if round(float(order_data.get("order_amount", 0)), 2) != round(float(payment.amount), 2):
            raise HTTPException(status_code=400, detail="Paid amount does not match the pending payment")
        if str(order_data.get("order_currency", "")).upper() != str(payment.currency or "").upper():
            raise HTTPException(status_code=400, detail="Payment currency does not match the pending payment")

        transaction_id = str(successful_payment.get("cf_payment_id") or cashfree_order_id)
        subscription, invoice_number = await complete_payment(
            payment, plan, client, current_user, content_id, db, transaction_id
        )

    # ── PayPal confirmation ───────────────────────────────────────────────────
    elif payment.payment_method == PaymentMethod.PAYPAL:
        if not payload.paypal_order_id or not payload.paypal_payer_id:
            raise HTTPException(status_code=400, detail="paypal_order_id and paypal_payer_id are required")
        if payment.gateway_order_id and payload.paypal_order_id != payment.gateway_order_id:
            raise HTTPException(status_code=400, detail="PayPal order does not match the pending payment")

        pp_client_id = paypal_cfg.get("client_id")
        pp_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
        if not pp_client_id or not pp_secret_encrypted:
            raise HTTPException(status_code=400, detail="PayPal is not configured")

        pp_secret = decrypt_secret(pp_secret_encrypted)
        sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
        base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"

        access_token = await _paypal_access_token(pp_client_id, pp_secret, sandbox)

        async with httpx.AsyncClient() as http:
            resp = await http.post(
                f"{base_url}/v2/checkout/orders/{payload.paypal_order_id}/capture",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                timeout=15,
            )
            if resp.status_code not in (200, 201):
                payment.status = PaymentStatus.FAILED
                await db.flush()
                raise HTTPException(status_code=400, detail="PayPal capture failed")
            capture_data = resp.json()

        capture_id = (
            capture_data.get("purchase_units", [{}])[0]
            .get("payments", {})
            .get("captures", [{}])[0]
            .get("id", payload.paypal_order_id)
        )

        capture_obj = (
            capture_data.get("purchase_units", [{}])[0]
            .get("payments", {})
            .get("captures", [{}])[0]
        )
        amount_obj = capture_obj.get("amount", {}) if isinstance(capture_obj, dict) else {}
        paid_currency = str(amount_obj.get("currency_code", "")).upper()
        paid_value_raw = amount_obj.get("value")
        try:
            paid_value = float(paid_value_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid PayPal capture amount")

        if paid_currency != str(payment.currency or "").upper():
            raise HTTPException(status_code=400, detail="Payment currency does not match the pending payment")
        if round(paid_value, 2) != round(float(payment.amount), 2):
            raise HTTPException(status_code=400, detail="Paid amount does not match the pending payment")

        # Persist the PayPal Vault token for future off-session auto-renewal charges
        vault_info = (
            capture_data.get("payment_source", {})
            .get("paypal", {})
            .get("attributes", {})
            .get("vault", {})
        )
        paypal_vault_id = vault_info.get("id")
        if paypal_vault_id and not current_user.paypal_vault_id:
            current_user.paypal_vault_id = str(paypal_vault_id)

        subscription, invoice_number = await complete_payment(
            payment, plan, client, current_user, content_id, db, capture_id
        )

    else:
        raise HTTPException(status_code=400, detail="Unsupported payment method")

    return CheckoutConfirmResponse(
        success=True,
        subscription_id=subscription.id,
        invoice_number=invoice_number,
    )


# ── Plan Upgrade ──────────────────────────────────────────────────────────────

@router.post("/upgrade/initiate", response_model=UpgradeInitiateResponse)
async def initiate_upgrade(
    payload: UpgradeInitiateRequest,
    request: Request,
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate a mid-cycle plan upgrade (industry-standard prorated billing),
    or an early trial-to-paid conversion.

    Logic:
    1. Find the user's current active or trialing subscription.
    2. Calculate unused credit using remaining time in the current billing cycle.
       A subscription still in TRIAL has no paid credit (nothing was charged),
       so the full new plan price is due immediately.
    3. Prorated charge = ``new_plan_price − credit`` (floored at 0).
    4. If charge == 0: cancel old plan, create new subscription immediately —
       ``payment_required=False`` is returned with the new ``subscription_id``.
    5. If charge > 0: create a pending Payment for the prorated amount, store
       ``upgrade_from_sub_id`` in notes, return gateway details.  The caller
       then calls ``POST /checkout/confirm`` as usual; ``complete_payment``
       cancels the old sub and activates the new one.

    Downgrade (new plan price < current plan price) is rejected for ACTIVE
    subscriptions — downgrades should be handled at end of cycle via a normal
    subscription purchase. A user still in TRIAL may convert to any paid plan,
    including the same plan they are trialing.
    """
    client = await _get_client(current_user._client_id, db)
    now = datetime.now(timezone.utc)

    # ── Resolve new plan ──────────────────────────────────────────────────────
    new_plan_result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == payload.new_plan_id,
            ClientSubscriptionPlan.client_id == client.id,
            ClientSubscriptionPlan.is_active.is_(True),
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
        )
    )
    new_plan = new_plan_result.scalar_one_or_none()
    if not new_plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")

    # ── Find current active or trialing subscription ─────────────────────────
    current_sub_result = await db.execute(
        select(UserSubscription, ClientSubscriptionPlan)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .where(
            UserSubscription.client_id == client.id,
            UserSubscription.user_id == current_user.id,
            UserSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
            UserSubscription.started_at <= now.isoformat(),
        )
        .order_by(UserSubscription.expires_at.desc())
        .limit(1)
    )
    row = current_sub_result.one_or_none()
    if not row:
        raise HTTPException(status_code=400, detail="No active subscription to upgrade from")

    current_sub, current_plan = row
    is_trial_conversion = current_sub.status == SubscriptionStatus.TRIAL

    if current_plan.id == new_plan.id and not is_trial_conversion:
        raise HTTPException(status_code=400, detail="Already subscribed to this plan")

    # ── Prorate calculation ───────────────────────────────────────────────────
    # Prefer the profile country, then securely resolve the visitor's location
    # server-side when the profile has not collected it yet.
    user_country = await _checkout_country(current_user, request)
    old_price, old_currency = (
        (0.0, new_plan.currency) if is_trial_conversion
        else _get_country_specific_price(current_plan, user_country)
    )
    new_price, new_currency = _get_country_specific_price(new_plan, user_country)

    if not is_trial_conversion and new_price < old_price:
        raise HTTPException(
            status_code=400,
            detail=(
                "Downgrades are not allowed mid-cycle. "
                "Your current plan remains active until it expires."
            ),
        )

    started_dt = _parse_iso_datetime(current_sub.started_at)
    expiry_dt = _parse_iso_datetime(current_sub.expires_at)

    remaining_seconds = max(0.0, (expiry_dt - now).total_seconds()) if expiry_dt else 0.0
    if started_dt and expiry_dt and expiry_dt > started_dt:
        cycle_seconds = max((expiry_dt - started_dt).total_seconds(), 0.0)
    else:
        estimated_cycle_end = _resolve_subscription_expiry(current_plan, now)
        cycle_seconds = max((estimated_cycle_end - now).total_seconds(), 0.0) if estimated_cycle_end else 0.0
    credit = round((remaining_seconds / cycle_seconds) * old_price, 2) if cycle_seconds > 0 else 0.0
    charge = round(max(0.0, new_price - credit), 2)

    # ── Free upgrade (unused credit covers the full new plan price) ───────────
    if charge == 0:
        current_sub.status = SubscriptionStatus.CANCELLED
        current_sub.cancelled_at = now.isoformat()

        free_payment = Payment(
            client_id=client.id,
            user_id=current_user.id,
            amount=0,
            currency=new_currency,
            status=PaymentStatus.SUCCESS,
            payment_method=PaymentMethod.STRIPE,
            reference_type=new_plan.plan_type.value,
            reference_id=str(new_plan.id),
            paid_at=now.isoformat(),
            gateway_transaction_id="upgrade-free",
            notes=json.dumps({"upgrade_from_sub_id": str(current_sub.id)}),
        )
        db.add(free_payment)
        await db.flush()

        new_sub = _build_subscription(new_plan, client, current_user, free_payment, None, start=now)
        db.add(new_sub)

        invoice_number = f"INV-{now.strftime('%Y%m%d')}-{str(free_payment.id)[:8].upper()}"
        db.add(Invoice(
            client_id=client.id,
            user_id=current_user.id,
            payment_id=free_payment.id,
            invoice_number=invoice_number,
            amount=0,
            currency=new_currency,
            tax_amount=0,
            issued_at=now.isoformat(),
        ))
        await db.commit()
        return UpgradeInitiateResponse(payment_required=False, subscription_id=new_sub.id)

    # ── Paid upgrade: create a payment for the prorated charge ───────────────
    stripe_cfg, paypal_cfg = _gateway_cfg(client)
    razorpay_cfg = get_active_payment_gateway_config(client.site_config, "razorpay")
    cashfree_cfg = get_active_payment_gateway_config(client.site_config, "cashfree")
    stripe_enabled = stripe_cfg.get("enabled", False)
    paypal_enabled = paypal_cfg.get("enabled", False)
    razorpay_enabled = razorpay_cfg.get("enabled", False)
    cashfree_enabled = cashfree_cfg.get("enabled", False)

    if not any((stripe_enabled, paypal_enabled, razorpay_enabled, cashfree_enabled)):
        raise HTTPException(status_code=400, detail="No payment gateway is configured for this platform")

    gateway = payload.gateway
    if gateway is None:
        enabled_gateways = [name for name, enabled in (
            ("stripe", stripe_enabled),
            ("paypal", paypal_enabled),
            ("razorpay", razorpay_enabled),
            ("cashfree", cashfree_enabled),
        ) if enabled]
        if len(enabled_gateways) > 1:
            raise HTTPException(
                status_code=400,
                detail=f"Multiple payment gateways are available. Please specify one of: {', '.join(enabled_gateways)}.",
            )
        gateway = enabled_gateways[0]

    enabled_by_gateway = {
        "stripe": stripe_enabled,
        "paypal": paypal_enabled,
        "razorpay": razorpay_enabled,
        "cashfree": cashfree_enabled,
    }
    if gateway not in enabled_by_gateway or not enabled_by_gateway[gateway]:
        raise HTTPException(status_code=400, detail=f"{str(gateway).capitalize()} is not enabled on this platform")

    cashfree_phone = _cashfree_customer_phone(current_user) if gateway == "cashfree" else None
    payment_methods = {
        "stripe": PaymentMethod.STRIPE,
        "paypal": PaymentMethod.PAYPAL,
        "razorpay": PaymentMethod.RAZORPAY,
        "cashfree": PaymentMethod.CASHFREE,
    }

    payment = Payment(
        client_id=client.id,
        user_id=current_user.id,
        amount=charge,
        currency=new_currency,
        status=PaymentStatus.PENDING,
        payment_method=payment_methods[gateway],
        reference_type=new_plan.plan_type.value,
        reference_id=str(new_plan.id),
        notes=json.dumps({"upgrade_from_sub_id": str(current_sub.id)}),
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment)

    if gateway == "stripe":
        secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
        if not secret_key_encrypted:
            raise HTTPException(status_code=400, detail="Stripe secret key is not configured")

        stripe.api_key = decrypt_secret(secret_key_encrypted)
        stripe_payment_method_id = payload.payment_method_id
        stripe_customer_id = current_user.stripe_customer_id
        if stripe_payment_method_id:
            if not stripe_customer_id:
                raise HTTPException(status_code=404, detail="Saved payment method not found")
            try:
                saved_method = await asyncio.to_thread(
                    stripe.PaymentMethod.retrieve, stripe_payment_method_id
                )
            except Exception:
                raise HTTPException(status_code=404, detail="Saved payment method not found")
            if saved_method.customer != stripe_customer_id or saved_method.type != "card":
                raise HTTPException(status_code=404, detail="Saved payment method not found")

        # Build shipping/billing address for India export compliance (same as /initiate).
        has_billing = bool(current_user.billing_line1 and current_user.billing_country)
        billing_address = {
            "line1": current_user.billing_line1 if has_billing else ".",
            "line2": current_user.billing_line2 or None,
            "city": current_user.billing_city or None,
            "state": current_user.billing_state or None,
            "postal_code": current_user.billing_postal_code or None,
            "country": (
                (current_user.billing_country or current_user.country or "IN").upper()[:2]
            ),
        }
        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=max(1, int(charge * 100)),
            currency=new_currency.lower(),
            description=f"Upgrade to {new_plan.name} (prorated)",
            receipt_email=current_user.email,
            shipping={
                "name": current_user.full_name or current_user.email,
                "address": billing_address,
            },
            metadata={
                "payment_id": str(payment.id),
                "plan_id": str(new_plan.id),
                "upgrade_from_sub_id": str(current_sub.id),
            },
            **(
                {
                    "customer": stripe_customer_id,
                    "payment_method": stripe_payment_method_id,
                }
                if stripe_customer_id and stripe_payment_method_id else {}
            ),
        )
        payment.gateway_order_id = intent.id
        await db.flush()
        await db.commit()
        return UpgradeInitiateResponse(
            payment_required=True,
            payment_id=payment.id,
            gateway="stripe",
            prorated_charge=charge,
            currency=new_currency,
            stripe_client_secret=intent.client_secret,
        )

    if gateway == "razorpay":
        key_id = razorpay_cfg.get("key_id")
        key_secret_encrypted = razorpay_cfg.get("key_secret_encrypted")
        if not key_id or not key_secret_encrypted:
            raise HTTPException(status_code=400, detail="Razorpay credentials are not configured")

        async with httpx.AsyncClient() as http:
            resp = await http.post(
                "https://api.razorpay.com/v1/orders",
                auth=(key_id, decrypt_secret(key_secret_encrypted)),
                json={
                    "amount": _expected_minor_units(charge),
                    "currency": new_currency.upper(),
                    "receipt": str(payment.id),
                    "notes": {
                        "payment_id": str(payment.id),
                        "client_id": str(client.id),
                        "plan_id": str(new_plan.id),
                        "upgrade_from_sub_id": str(current_sub.id),
                    },
                },
                timeout=15,
            )
        if resp.status_code not in (200, 201):
            logger.error("Razorpay upgrade order creation failed: %s", resp.text)
            raise HTTPException(status_code=502, detail="Could not create Razorpay order")

        payment.gateway_order_id = resp.json()["id"]
        await db.flush()
        await db.commit()
        return UpgradeInitiateResponse(
            payment_required=True,
            payment_id=payment.id,
            gateway="razorpay",
            prorated_charge=charge,
            currency=new_currency,
            razorpay_order_id=payment.gateway_order_id,
            razorpay_key_id=key_id,
        )

    if gateway == "cashfree":
        app_id = cashfree_cfg.get("app_id")
        app_secret_encrypted = cashfree_cfg.get("app_secret_encrypted")
        if not app_id or not app_secret_encrypted:
            raise HTTPException(status_code=400, detail="Cashfree credentials are not configured")

        cashfree_order_id = f"sv_{payment.id.hex}"
        cashfree_mode = cashfree_cfg.get("mode", "test")
        await db.commit()
        order = await _create_or_recover_cashfree_order(
            app_id=app_id,
            app_secret=decrypt_secret(app_secret_encrypted),
            mode=cashfree_mode,
            order_id=cashfree_order_id,
            amount=charge,
            currency=new_currency,
            customer_id=str(current_user.id),
            customer_name=current_user.full_name or current_user.email,
            customer_email=current_user.email,
            customer_phone=cashfree_phone,
            return_url=_cashfree_return_url(client, request, payment.id),
            order_note=f"Upgrade to {new_plan.name}",
            on_unrecoverable_order=lambda: _abandon_payment(payment, db),
        )

        payment.gateway_order_id = order.get("order_id", cashfree_order_id)
        await db.flush()
        await db.commit()
        return UpgradeInitiateResponse(
            payment_required=True,
            payment_id=payment.id,
            gateway="cashfree",
            prorated_charge=charge,
            currency=new_currency,
            cashfree_order_id=payment.gateway_order_id,
            cashfree_payment_session_id=order.get("payment_session_id"),
            cashfree_mode=cashfree_mode,
        )

    # ── PayPal ────────────────────────────────────────────────────────────────
    pp_client_id = paypal_cfg.get("client_id")
    pp_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
    if not pp_client_id or not pp_secret_encrypted:
        raise HTTPException(status_code=400, detail="PayPal credentials are not configured")

    pp_secret = decrypt_secret(pp_secret_encrypted)
    sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    access_token = await _paypal_access_token(pp_client_id, pp_secret, sandbox)

    async with httpx.AsyncClient() as http:
        resp = await http.post(
            f"{base_url}/v2/checkout/orders",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "intent": "CAPTURE",
                "purchase_units": [{
                    "reference_id": str(payment.id),
                    "amount": {"currency_code": new_currency.upper(), "value": f"{charge:.2f}"},
                    "description": f"Upgrade to {new_plan.name} (prorated)",
                }],
            },
            timeout=15,
        )
        resp.raise_for_status()
        order = resp.json()

    approval_url = next(
        (link["href"] for link in order.get("links", []) if link["rel"] == "approve"), None
    )
    payment.gateway_order_id = order["id"]
    await db.flush()
    await db.commit()

    return UpgradeInitiateResponse(
        payment_required=True,
        payment_id=payment.id,
        gateway="paypal",
        prorated_charge=charge,
        currency=new_currency,
        paypal_order_id=order["id"],
        paypal_approval_url=approval_url,
    )
