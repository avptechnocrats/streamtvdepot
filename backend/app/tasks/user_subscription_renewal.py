"""
End-user subscription renewal task — auto-charges Pankaj/Vishal/Manoj-style
end users on their client's own Stripe/PayPal account (SplixTV's gateway,
not SignalView's superadmin gateway).

This mirrors app/tasks/subscription_renewal.py (Client -> SignalView SaaS
billing) but operates one layer down: EndUser -> Client (tenant) billing.

Lifecycle:
  active     -> normal, fully paid period
  expired    -> access blocked when renewal or trial conversion fails
  cancelled  -> explicitly cancelled

Flow:
  1. pre_user_renewal_reminders() - T-14/7/3/1 day reminder emails
  2. process_user_subscription_renewals() - at expiry:
     a. Skip if a queued next-period row already exists (manual renewal or
        schedule_downgrade already handled it — no charge needed here)
     b. Skip (auto-extend for free) if the effective price is 0
     c. If auto_renew=True and a saved Stripe/PayPal token exists -> off-session charge
        - Success: create next period (Payment + UserSubscription + Invoice), receipt email
        - Failure: expire the subscription immediately
     d. No saved payment method -> expire the subscription immediately
"""

import asyncio
import base64
import hashlib
import json
import logging
import uuid
from calendar import monthrange
from datetime import datetime, timedelta, timezone

import httpx
from app.core.payment_gateways import get_active_payment_gateway_config
import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_secret
from app.core.system_mail import send_system_email, get_client_logo_url, get_client_footer_text
from app.core.email_templates import generate_professional_email_html
from app.core.invoice_generator import generate_billing_receipt_pdf
from app.core.renewal_gateways import get_enabled_renewal_gateway_names
from app.models.client.payment import Invoice, Payment, PaymentMethod, PaymentStatus
from app.models.client.subscription import (
    ClientSubscriptionPlan,
    PlanBillingCycle,
    PlanType,
    SubscriptionStatus,
    UserSubscription,
    UserSubscriptionRenewalAudit,
)
from app.models.client.user import EndUser
from app.models.superadmin.client import Client

logger = logging.getLogger(__name__)

RENEWAL_CANDIDATE_LOOKAHEAD_MINUTES = 15

# Days per billing cycle — kept in sync with app/api/v1/auth/checkout.py
BILLING_CYCLE_DAYS: dict[str, int | None] = {
    "daily": 1,
    "weekly": 7,
    "monthly": 30,
    "quarterly": 90,
    "yearly": 365,
    "lifetime": None,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _gateway_cfg(client: Client) -> tuple[dict, dict]:
    """Return (stripe_cfg, paypal_cfg) from the tenant's own site_config."""
    return (
        get_active_payment_gateway_config(client.site_config, "stripe"),
        get_active_payment_gateway_config(client.site_config, "paypal"),
    )


async def _paypal_access_token(client_id: str, secret: str, sandbox: bool) -> str:
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    auth = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            f"{base_url}/v1/oauth2/token",
            headers={"Authorization": f"Basic {auth}"},
            data={"grant_type": "client_credentials"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def _get_country_specific_price(plan: ClientSubscriptionPlan, user_country: str | None) -> tuple[float, str]:
    if not plan.country_pricing or not user_country:
        return float(plan.price), plan.currency
    for item in plan.country_pricing:
        if str(item.get("country", "")).upper() == user_country.upper():
            return float(item.get("price", plan.price)), str(item.get("currency", plan.currency))
    return float(plan.price), plan.currency


def _add_months(anchor: datetime, months: int) -> datetime:
    total_months = (anchor.month - 1) + months
    year = anchor.year + total_months // 12
    month = (total_months % 12) + 1
    day = min(anchor.day, monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def _resolve_next_expiry(plan: ClientSubscriptionPlan, start: datetime) -> datetime | None:
    """Mirrors app/api/v1/auth/checkout.py::_resolve_subscription_expiry exactly
    so renewal periods match manually-purchased periods for the same plan."""
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


def _invoice_number(payment_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    return f"INV-{now.strftime('%Y%m%d')}-{str(payment_id)[:8].upper()}"


def _renewal_idempotency_key(sub: UserSubscription) -> str:
    """Stable for retries of the same billing period so a crash/retry can't double-charge.
    Versioned so a corrected request shape (e.g. new required fields) never collides
    with a previously-cached failed fingerprint for the same billing period."""
    return hashlib.sha256(f"user-renewal-v2-{sub.id}-{sub.expires_at}".encode()).hexdigest()


async def _record_renewal_audit(
    db: AsyncSession,
    *,
    sub: UserSubscription,
    plan: ClientSubscriptionPlan,
    end_user: EndUser,
    client: Client,
    outcome: str,
    failure_reason: str | None = None,
    failure_detail: str | None = None,
    provider: str | None = None,
    gateway_transaction_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Persist a per-subscription renewal outcome for auditing and future analysis."""
    audit = UserSubscriptionRenewalAudit(
        client_id=sub.client_id,
        user_id=sub.user_id,
        subscription_id=sub.id,
        plan_id=plan.id,
        status=sub.status,
        outcome=outcome,
        failure_reason=failure_reason,
        failure_detail=failure_detail,
        provider=provider,
        gateway_transaction_id=gateway_transaction_id,
        metadata_json={
            "client_id": str(client.id),
            "user_email": end_user.email,
            "plan_name": plan.name,
            "expires_at": sub.expires_at,
            **(metadata or {}),
        },
    )
    db.add(audit)
    await db.flush()


async def _send_user_email(
    db: AsyncSession,
    *,
    client: Client,
    end_user: EndUser,
    subject: str,
    body_text: str,
    event_key: str,
    metadata: dict | None = None,
    invoice: Invoice | None = None,
    payment: Payment | None = None,
    plan_name: str | None = None,
) -> None:
    try:
        cfg = dict(client.site_config) if client.site_config else {}
        logo_url = await get_client_logo_url(db, client.id)
        company_name = cfg.get("site_title") or client.slug or "SignalView"
        footer_text = await get_client_footer_text(cfg)
        html = generate_professional_email_html(
            subject=subject,
            body_text=body_text,
            logo_url=logo_url,
            company_name=company_name,
            footer_text=footer_text,
        )

        attachments = None
        if invoice is not None and payment is not None:
            try:
                pdf = generate_billing_receipt_pdf(
                    invoice_number=invoice.invoice_number,
                    created_at=payment.created_at.isoformat() if payment.created_at else None,
                    paid_at=payment.paid_at,
                    amount=float(invoice.amount),
                    currency=invoice.currency,
                    status="paid",
                    plan_name=plan_name,
                    period_start=payment.paid_at,
                    period_end=None,
                    transaction_id=payment.gateway_transaction_id,
                    payment_method=(
                        payment.payment_method.value
                        if hasattr(payment.payment_method, "value") else str(payment.payment_method)
                    ),
                    issuer_footer=company_name,
                    logo_url=logo_url,
                )
                attachments = [(f"invoice-{invoice.invoice_number}.pdf", pdf.getvalue(), "pdf")]
            except Exception:
                logger.exception("Invoice PDF attachment generation failed for end user %s", end_user.id)

        await send_system_email(
            db,
            event_key=event_key,
            to_email=end_user.email,
            to_name=end_user.full_name,
            subject=subject,
            body_text=body_text,
            body_html=html,
            client_id=client.id,
            metadata=metadata or {"user_id": str(end_user.id), "client_id": str(client.id)},
            attachments=attachments,
        )
    except Exception:
        logger.exception("Renewal email send failed for end user %s (event=%s)", end_user.id, event_key)


async def _has_queued_next_period(
    db: AsyncSession, sub: UserSubscription
) -> bool:
    """Return True when a future-dated active row already covers the next period.

    Industry-standard idempotency requires considering a renewal as already covered
    when the next-period subscription starts at or after the current expiry boundary,
    not only when it starts strictly after it. A row created at the exact expiry time
    is still the same billed period continuation; recharging it is a duplicate.
    """
    if not sub.expires_at:
        return False

    result = await db.execute(
        select(UserSubscription.id).where(
            UserSubscription.client_id == sub.client_id,
            UserSubscription.user_id == sub.user_id,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
            UserSubscription.started_at.isnot(None),
            UserSubscription.started_at >= sub.expires_at,
            UserSubscription.expires_at.is_not(None),
            UserSubscription.expires_at > sub.expires_at,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _find_successful_renewal_payment(
    db: AsyncSession,
    sub: UserSubscription,
    plan: ClientSubscriptionPlan,
) -> Payment | None:
    """Find a locally committed gateway success for this exact source period."""
    source_marker = json.dumps({"auto_renewal_of_sub_id": str(sub.id)})[1:-1]
    result = await db.execute(
        select(Payment)
        .where(
            Payment.client_id == sub.client_id,
            Payment.user_id == sub.user_id,
            Payment.reference_type == plan.plan_type.value,
            Payment.reference_id == str(plan.id),
            Payment.status == PaymentStatus.SUCCESS,
            Payment.notes.contains(source_marker),
        )
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _stripe_payment_method_for_payment(
    payment: Payment | None,
    customer_id: str,
) -> str | None:
    """Return the card used by a successful Stripe payment, if still attached."""
    if not payment or payment.payment_method != PaymentMethod.STRIPE or not payment.gateway_transaction_id:
        return None
    try:
        intent = await asyncio.to_thread(
            stripe.PaymentIntent.retrieve,
            payment.gateway_transaction_id,
        )
        if intent.customer != customer_id:
            return None
        payment_method = intent.payment_method
        payment_method_id = getattr(payment_method, "id", payment_method)
        return payment_method_id if isinstance(payment_method_id, str) else None
    except stripe.error.StripeError:
        return None


async def _select_stripe_renewal_payment_method(
    db: AsyncSession,
    end_user: EndUser,
    sub: UserSubscription,
) -> str | None:
    """Select a reusable card using the renewal payment precedence rules."""
    if not end_user.stripe_customer_id:
        return None

    customer_id = end_user.stripe_customer_id

    # Reuse the card that paid for the current subscription period.
    previous_payment = None
    if sub.payment_id:
        previous_payment = (
            await db.execute(select(Payment).where(Payment.id == sub.payment_id))
        ).scalar_one_or_none()
    payment_method_id = await _stripe_payment_method_for_payment(previous_payment, customer_id)
    if payment_method_id:
        try:
            method = await asyncio.to_thread(stripe.PaymentMethod.retrieve, payment_method_id)
            if method.customer == customer_id and method.type == "card":
                return payment_method_id
        except stripe.error.StripeError:
            pass

    customer = await asyncio.to_thread(stripe.Customer.retrieve, customer_id)
    default_payment_method = (customer.get("invoice_settings") or {}).get("default_payment_method")
    if default_payment_method:
        try:
            method = await asyncio.to_thread(stripe.PaymentMethod.retrieve, default_payment_method)
            if method.customer == customer_id and method.type == "card":
                return default_payment_method
        except stripe.error.StripeError:
            pass

    # Stripe does not expose a reliable last-used timestamp on a PaymentMethod.
    # Resolve the newest successful local Stripe payment back to its card.
    recent_payments = await db.execute(
        select(Payment)
        .where(
            Payment.client_id == sub.client_id,
            Payment.user_id == sub.user_id,
            Payment.payment_method == PaymentMethod.STRIPE,
            Payment.status == PaymentStatus.SUCCESS,
            Payment.gateway_transaction_id.isnot(None),
        )
        .order_by(Payment.created_at.desc())
        .limit(20)
    )
    for payment in recent_payments.scalars():
        payment_method_id = await _stripe_payment_method_for_payment(payment, customer_id)
        if payment_method_id:
            try:
                method = await asyncio.to_thread(stripe.PaymentMethod.retrieve, payment_method_id)
                if method.customer == customer_id and method.type == "card":
                    return payment_method_id
            except stripe.error.StripeError:
                continue

    # 4. Last-resort compatibility fallback for customers whose historical
    # payments cannot be resolved back to a currently attached card.
    payment_methods = await asyncio.to_thread(
        stripe.PaymentMethod.list,
        customer=customer_id,
        type="card",
    )
    if payment_methods.data:
        return payment_methods.data[0].id

    return None


def _make_renewal_payment(
    sub: UserSubscription,
    plan: ClientSubscriptionPlan,
    amount: float,
    currency: str,
    now: datetime,
    status: PaymentStatus,
    payment_method: PaymentMethod,
    transaction_id: str | None,
) -> Payment:
    return Payment(
        client_id=sub.client_id,
        user_id=sub.user_id,
        amount=amount,
        currency=currency,
        status=status,
        payment_method=payment_method,
        reference_type=plan.plan_type.value,
        reference_id=str(plan.id),
        gateway_transaction_id=transaction_id,
        paid_at=now.isoformat() if status == PaymentStatus.SUCCESS else None,
        notes=json.dumps({"auto_renewal_of_sub_id": str(sub.id)}),
    )


def _trial_renewal_should_run(sub: UserSubscription, now: datetime) -> bool:
    """A trial period converts to a paid auto-renew at expiry for true first-time subscribers."""
    if sub.status != SubscriptionStatus.TRIAL or not sub.auto_renew:
        return False
    if not sub.expires_at:
        return False
    try:
        return datetime.fromisoformat(sub.expires_at) <= now
    except (TypeError, ValueError):
        return False


async def _activate_next_period(
    db: AsyncSession,
    sub: UserSubscription,
    plan: ClientSubscriptionPlan,
    end_user: EndUser,
    client: Client,
    amount: float,
    currency: str,
    now: datetime,
    payment_method: PaymentMethod,
    transaction_id: str,
    existing_payment: Payment | None = None,
) -> None:
    """Create the paid Payment + next-period UserSubscription + Invoice, and email a receipt.

    For billing correctness, the previous active row must no longer be current once the
    next period is created. Having multiple simultaneously active rows is not valid
    for OTT SaaS subscription billing because it creates overlapping current access
    states and enables duplicate renewals.
    """
    payment = existing_payment
    if payment is None:
        payment = _make_renewal_payment(
            sub, plan, amount, currency, now, PaymentStatus.SUCCESS, payment_method, transaction_id
        )
        db.add(payment)
        await db.flush()

    # Close the previous period before creating the new current one.
    sub.status = SubscriptionStatus.EXPIRED
    sub.grace_period_ends_at = None
    sub.reminder_sent_days = None

    chain_start = _parse_iso(sub.expires_at) or now
    next_expires = _resolve_next_expiry(plan, chain_start)
    new_sub = UserSubscription(
        client_id=sub.client_id,
        user_id=sub.user_id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        started_at=chain_start.isoformat(),
        expires_at=next_expires.isoformat() if next_expires else None,
        auto_renew=next_expires is not None,
        content_id=None,
        payment_id=payment.id,
        executed_by="System",
    )
    db.add(new_sub)

    invoice = Invoice(
        client_id=sub.client_id,
        user_id=sub.user_id,
        payment_id=payment.id,
        invoice_number=_invoice_number(payment.id),
        amount=amount,
        currency=currency,
        tax_amount=0,
        issued_at=now.isoformat(),
    )
    db.add(invoice)

    subject = f"Payment received — {plan.name} renewed"
    body_text = (
        f"Hi {end_user.full_name or 'there'},\n\n"
        f"Your {plan.name} subscription has been automatically renewed.\n"
        f"Invoice: {invoice.invoice_number}\n"
        f"Amount charged: {amount:.2f} {currency}\n"
        f"Transaction ID: {transaction_id}\n\n"
        "Thank you for your continued subscription."
    )
    await _send_user_email(
        db, client=client, end_user=end_user, subject=subject, body_text=body_text,
        event_key="user_subscription_auto_renewed",
        metadata={"payment_id": str(payment.id), "transaction_id": transaction_id},
        invoice=invoice, payment=payment, plan_name=plan.name,
    )
    logger.info("Auto-renewed end user %s (client %s) via %s (txn %s)", end_user.id, client.id, payment_method.value, transaction_id)


async def _attempt_stripe_charge(
    client: Client, end_user: EndUser, sub: UserSubscription, plan: ClientSubscriptionPlan,
    amount: float, currency: str, db: AsyncSession
) -> tuple[str | None, str | None]:
    """Return (succeeded PaymentIntent id, None) on success, or (None, error_detail)
    if the charge failed/unavailable."""
    stripe_cfg, _ = _gateway_cfg(client)
    if not stripe_cfg.get("enabled", False):
        return None, None
    secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
    if not secret_key_encrypted or not end_user.stripe_customer_id:
        return None, None

    stripe.api_key = decrypt_secret(secret_key_encrypted)
    customer_id = end_user.stripe_customer_id

    try:
        payment_method_id = await _select_stripe_renewal_payment_method(db, end_user, sub)
        if not payment_method_id:
            logger.info("No saved card for Stripe customer %s (end user %s)", customer_id, end_user.id)
            return None, "No saved card found on the Stripe customer."

        amount_minor = max(1, int(round(amount * 100)))

        # Same shipping/billing address block used at checkout (see checkout.py) — Stripe
        # requires this for India cross-border export compliance. Omitting it here caused
        # every off-session renewal charge to be rejected even with a valid saved card.
        has_billing = bool(end_user.billing_line1 and end_user.billing_country)
        billing_address = {
            "line1": end_user.billing_line1 if has_billing else ".",
            "line2": end_user.billing_line2 or None,
            "city": end_user.billing_city or None,
            "state": end_user.billing_state or None,
            "postal_code": end_user.billing_postal_code or None,
            "country": (end_user.billing_country or end_user.country or "IN").upper()[:2],
        }

        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=amount_minor,
            currency=currency.lower(),
            customer=customer_id,
            payment_method=payment_method_id,
            off_session=True,
            confirm=True,
            description=f"Auto-renewal: {plan.name} — {end_user.email}",
            shipping={
                "name": end_user.full_name or end_user.email,
                "address": billing_address,
            },
            metadata={"user_id": str(end_user.id), "plan_id": str(plan.id), "client_id": str(client.id)},
            idempotency_key=_renewal_idempotency_key(sub),
        )
    except stripe.error.CardError as e:
        logger.warning("Card declined for end user %s: %s", end_user.id, e.user_message)
        return None, f"Card declined: {e.user_message or e.code or 'unknown reason'}"
    except stripe.error.StripeError as e:
        logger.exception("Stripe off-session charge failed for end user %s", end_user.id)
        return None, f"Stripe error: {e.user_message or str(e)}"
    except Exception as e:
        logger.exception("Stripe off-session charge failed for end user %s", end_user.id)
        return None, f"Unexpected error while charging Stripe: {e}"

    if intent.status == "succeeded":
        return intent.id, None
    return None, f"PaymentIntent ended in status '{intent.status}' instead of 'succeeded'."


async def _attempt_paypal_charge(
    client: Client, end_user: EndUser, sub: UserSubscription, plan: ClientSubscriptionPlan,
    amount: float, currency: str, db: AsyncSession
) -> tuple[str | None, str | None]:
    """Return (succeeded capture id, None) on success, or (None, error_detail)
    if the charge failed/unavailable."""
    _, paypal_cfg = _gateway_cfg(client)
    if not paypal_cfg.get("enabled", False):
        return None, None
    pp_client_id = paypal_cfg.get("client_id")
    pp_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
    if not pp_client_id or not pp_secret_encrypted or not end_user.paypal_vault_id:
        return None, None

    pp_secret = decrypt_secret(pp_secret_encrypted)
    sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    vault_id = end_user.paypal_vault_id

    try:
        access_token = await _paypal_access_token(pp_client_id, pp_secret, sandbox)
        async with httpx.AsyncClient() as http:
            resp = await http.post(
                f"{base_url}/v2/checkout/orders",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                    # Stable per billing period so a crash/retry can't double-charge
                    "PayPal-Request-Id": _renewal_idempotency_key(sub),
                },
                json={
                    "intent": "CAPTURE",
                    "purchase_units": [{
                        "amount": {"currency_code": currency.upper(), "value": f"{amount:.2f}"},
                        "description": f"Auto-renewal: {plan.name}",
                        "custom_id": str(end_user.id),
                    }],
                    "payment_source": {"token": {"id": vault_id, "type": "PAYMENT_METHOD_TOKEN"}},
                },
                timeout=20,
            )
            if resp.status_code not in (200, 201):
                logger.warning(
                    "PayPal vault charge rejected for end user %s: %s %s",
                    end_user.id, resp.status_code, resp.text[:200],
                )
                return None, f"PayPal order creation returned {resp.status_code}: {resp.text[:200]}"
            order = resp.json()
            order_id = order.get("id")
            order_status = order.get("status")

            if order_status == "APPROVED":
                capture_resp = await http.post(
                    f"{base_url}/v2/checkout/orders/{order_id}/capture",
                    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                    timeout=20,
                )
                if capture_resp.status_code not in (200, 201):
                    return None, f"PayPal capture returned {capture_resp.status_code}: {capture_resp.text[:200]}"
                order = capture_resp.json()
                order_status = order.get("status")
    except Exception as e:
        logger.exception("PayPal vault charge failed for end user %s", end_user.id)
        return None, f"PayPal error: {e}"

    if order_status != "COMPLETED":
        return None, f"PayPal order ended in status '{order_status}' instead of 'COMPLETED'."

    capture_obj = order.get("purchase_units", [{}])[0].get("payments", {}).get("captures", [{}])[0]
    return capture_obj.get("id", order_id), None


async def _attempt_charge(
    client: Client, end_user: EndUser, sub: UserSubscription, plan: ClientSubscriptionPlan,
    amount: float, currency: str, db: AsyncSession
) -> tuple[tuple[PaymentMethod, str] | None, str | None]:
    """Attempt tenant-enabled renewal adapters in configured priority order."""
    error_detail: str | None = None
    adapters = {
        "stripe": (PaymentMethod.STRIPE, end_user.stripe_customer_id, _attempt_stripe_charge),
        "paypal": (PaymentMethod.PAYPAL, end_user.paypal_vault_id, _attempt_paypal_charge),
    }
    for provider_name in get_enabled_renewal_gateway_names(client.site_config):
        adapter = adapters.get(provider_name)
        if adapter is None:
            logger.info(
                "Auto-renewal adapter is not registered for enabled provider %s (client %s)",
                provider_name,
                client.id,
            )
            continue
        payment_method, saved_instrument, charge = adapter
        if not saved_instrument:
            continue
        txn_id, provider_error = await charge(client, end_user, sub, plan, amount, currency, db)
        if txn_id:
            return (payment_method, txn_id), None
        error_detail = provider_error or error_detail
    return None, error_detail


def _expire_subscription(sub: UserSubscription) -> None:
    sub.status = SubscriptionStatus.EXPIRED
    sub.grace_period_ends_at = None
    sub.reminder_sent_days = None


# ── Main renewal processor ────────────────────────────────────────────────────

async def process_user_subscription_renewals(db: AsyncSession) -> None:
    """Enqueue due end-user renewals for processing by billing workers."""
    now = datetime.now(timezone.utc)
    window_end = (now + timedelta(minutes=RENEWAL_CANDIDATE_LOOKAHEAD_MINUTES)).isoformat()

    result = await db.execute(
        select(UserSubscription.id)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .where(
            UserSubscription.auto_renew.is_(True),
            UserSubscription.expires_at.isnot(None),
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
            UserSubscription.status.in_([
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.TRIAL,
            ]),
            # Include overdue rows so a delayed scheduler run still renews them.
            UserSubscription.expires_at <= window_end,
        )
        .order_by(UserSubscription.expires_at.asc())
        .limit(settings.BILLING_RENEWAL_DISPATCH_BATCH_SIZE)
    )
    sub_ids = [row[0] for row in result.all()]

    from app.tasks.billing_worker import process_user_subscription_renewal_task
    for sub_id in sub_ids:
        process_user_subscription_renewal_task.apply_async(
            args=[str(sub_id)],
            task_id=f"user-subscription-renewal:{sub_id}",
        )

    if sub_ids:
        logger.info("Queued %s end-user subscription renewals", len(sub_ids))


async def process_user_subscription_renewal_by_id(sub_id: uuid.UUID) -> None:
    """Process one renewal transaction inside a dedicated billing worker."""
    now = datetime.now(timezone.utc)
    try:
        async with AsyncSessionLocal() as db:
            await _process_one_user_renewal(sub_id, now, db)
            await db.commit()
    except Exception as exc:
        logger.exception("Renewal failed for subscription %s", sub_id)
        await _record_failed_renewal_audit(sub_id, exc)
        raise


async def _record_failed_renewal_audit(sub_id: uuid.UUID, exc: Exception) -> None:
    try:
        async with AsyncSessionLocal() as audit_db:
            sub = (await audit_db.execute(select(UserSubscription).where(UserSubscription.id == sub_id))).scalar_one_or_none()
            if sub is None:
                return
            plan = (await audit_db.execute(select(ClientSubscriptionPlan).where(ClientSubscriptionPlan.id == sub.plan_id))).scalar_one_or_none()
            end_user = (await audit_db.execute(select(EndUser).where(EndUser.id == sub.user_id))).scalar_one_or_none()
            client = (await audit_db.execute(select(Client).where(Client.id == sub.client_id))).scalar_one_or_none()
            if plan is not None and end_user is not None and client is not None:
                await _record_renewal_audit(
                    audit_db,
                    sub=sub,
                    plan=plan,
                    end_user=end_user,
                    client=client,
                    outcome="failed",
                    failure_reason="worker_exception",
                    failure_detail=str(exc),
                )
            await audit_db.commit()
    except Exception:
        logger.exception("Failed to persist renewal audit for subscription %s", sub_id)


async def _process_one_user_renewal(
    sub_id: uuid.UUID,
    now: datetime,
    db: AsyncSession,
) -> None:
    row = (await db.execute(
        select(UserSubscription, ClientSubscriptionPlan, EndUser, Client)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .join(EndUser, UserSubscription.user_id == EndUser.id)
        .join(Client, UserSubscription.client_id == Client.id)
        .where(UserSubscription.id == sub_id)
        .with_for_update(of=UserSubscription)
    )).first()
    if not row:
        return
    sub, plan, end_user, client = row
    # Re-validate under the row lock — a concurrent/overlapping run may have
    # already handled this subscription.
    if sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL):
        return
    if not sub.auto_renew:
        return
    if sub.status == SubscriptionStatus.TRIAL and not _trial_renewal_should_run(sub, now):
        return

    if (
        sub.status == SubscriptionStatus.TRIAL
        and getattr(plan, "trial_requires_active_payment_method", False)
        and not end_user.stripe_customer_id
        and not end_user.paypal_vault_id
    ):
        _expire_subscription(sub)
        await _record_renewal_audit(
            db,
            sub=sub,
            plan=plan,
            end_user=end_user,
            client=client,
            outcome="failed",
            failure_reason="trial_payment_method_missing",
            failure_detail="Trial expired because no active payment method was attached.",
        )
        await _send_user_email(
            db,
            client=client,
            end_user=end_user,
            subject=f"Trial expired — add a payment method for {plan.name}",
            body_text=(
                f"Hi {end_user.full_name or 'there'},\n\n"
                f"Your free trial for {plan.name} has ended because no active payment method was available."
                " Access has been removed. Add a payment method to subscribe again."
            ),
            event_key="user_trial_payment_method_required",
        )
        return

    # A manual renewal or scheduled downgrade already queued the next period.
    if await _has_queued_next_period(db, sub):
        return

    # Recover a committed local success after a crash between gateway capture
    # and entitlement creation without charging the customer again.
    existing_payment = await _find_successful_renewal_payment(db, sub, plan)
    if existing_payment is not None:
        await _activate_next_period(
            db,
            sub,
            plan,
            end_user,
            client,
            float(existing_payment.amount),
            existing_payment.currency,
            now,
            existing_payment.payment_method,
            existing_payment.gateway_transaction_id or "reconciled-renewal",
            existing_payment=existing_payment,
        )
        return

    amount, currency = _get_country_specific_price(plan, end_user.country)

    # Free plan renewals need no charge — just auto-extend.
    if amount <= 0:
        payment = _make_renewal_payment(
            sub, plan, 0, currency, now, PaymentStatus.SUCCESS, PaymentMethod.OTHER, "free-renewal"
        )
        db.add(payment)
        await db.flush()
        chain_start = _parse_iso(sub.expires_at) or now
        next_expires = _resolve_next_expiry(plan, chain_start)
        db.add(UserSubscription(
            client_id=sub.client_id,
            user_id=sub.user_id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            started_at=chain_start.isoformat(),
            expires_at=next_expires.isoformat() if next_expires else None,
            auto_renew=next_expires is not None,
            content_id=None,
            payment_id=payment.id,
            executed_by="System",
        ))
        sub.status = SubscriptionStatus.EXPIRED
        sub.grace_period_ends_at = None
        sub.reminder_sent_days = None
        return

    charge_result, charge_error = await _attempt_charge(client, end_user, sub, plan, amount, currency, db)
    if charge_result:
        method, txn_id = charge_result
        await _activate_next_period(db, sub, plan, end_user, client, amount, currency, now, method, txn_id)
        return

    # No saved payment method, or the charge failed — expire the subscription immediately.
    failure_reason = "no_saved_payment_method"
    if end_user.stripe_customer_id or end_user.paypal_vault_id:
        failure_reason = "off_session_charge_failed"
    failure_detail = (
        "No Stripe or PayPal vault payment method was available on file."
        if not (end_user.stripe_customer_id or end_user.paypal_vault_id)
        else (charge_error or "Off-session renewal charge returned no successful transaction for the saved payment method.")
    )

    failed_method = PaymentMethod.OTHER
    if end_user.stripe_customer_id:
        failed_method = PaymentMethod.STRIPE
    elif end_user.paypal_vault_id:
        failed_method = PaymentMethod.PAYPAL

    failed_payment = Payment(
        client_id=sub.client_id,
        user_id=sub.user_id,
        amount=amount,
        currency=currency,
        status=PaymentStatus.FAILED,
        payment_method=failed_method,
        reference_type=plan.plan_type.value,
        reference_id=str(plan.id),
        notes=json.dumps({
            "auto_renewal_of_sub_id": str(sub.id),
            "failure_reason": failure_reason,
            "failure_detail": failure_detail,
        }),
    )
    db.add(failed_payment)
    await db.flush()

    await _record_renewal_audit(
        db,
        sub=sub,
        plan=plan,
        end_user=end_user,
        client=client,
        outcome="failed",
        failure_reason=failure_reason,
        failure_detail=failure_detail,
        metadata={"amount": float(amount), "currency": currency, "payment_id": str(failed_payment.id)},
    )
    _expire_subscription(sub)
    subject = f"Subscription expired — {plan.name}"
    body_text = (
        f"Hi {end_user.full_name or 'there'},\n\n"
        f"We were unable to process the renewal payment of {amount:.2f} {currency} for your {plan.name} plan.\n"
        "Your subscription access has ended. Please add a payment method and subscribe again to regain access."
    )
    await _send_user_email(
        db, client=client, end_user=end_user, subject=subject, body_text=body_text,
        event_key="user_subscription_renewal_failed",
    )


# ── Pre-renewal reminders ─────────────────────────────────────────────────────

async def pre_user_renewal_reminders(db: AsyncSession) -> None:
    """Queue active subscriptions for reminder processing by notification workers."""
    result = await db.execute(
        select(UserSubscription.id)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .where(
            UserSubscription.status == SubscriptionStatus.ACTIVE,
            UserSubscription.expires_at.isnot(None),
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
        )
        .order_by(UserSubscription.expires_at.asc())
        .limit(settings.REMINDER_DISPATCH_BATCH_SIZE)
    )
    from app.tasks.notification_worker import process_user_subscription_reminder_task
    sub_ids = [row[0] for row in result.all()]
    for sub_id in sub_ids:
        process_user_subscription_reminder_task.apply_async(
            args=[str(sub_id)],
            task_id=f"user-subscription-reminder:{sub_id}",
        )

    if sub_ids:
        logger.info("Queued %s end-user subscription reminders", len(sub_ids))


async def process_user_subscription_reminder_by_id(sub_id: uuid.UUID) -> None:
    """Revalidate and send the currently eligible reminder for one subscription."""
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(UserSubscription, ClientSubscriptionPlan, EndUser, Client)
            .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
            .join(EndUser, UserSubscription.user_id == EndUser.id)
            .join(Client, UserSubscription.client_id == Client.id)
            .where(UserSubscription.id == sub_id)
            .with_for_update(of=UserSubscription)
        )).first()
        if row is None:
            return

        sub, plan, end_user, client = row
        now = datetime.now(timezone.utc)
        if sub.status != SubscriptionStatus.ACTIVE or plan.plan_type != PlanType.SUBSCRIPTION:
            return

        expires_at = _parse_iso(sub.expires_at)
        if not expires_at or expires_at <= now:
            return

        days_remaining = (expires_at - now).days
        sent = set((sub.reminder_sent_days or "").split(",")) - {""}

        for threshold in (1, 3, 7, 14):
            key = str(threshold)
            if days_remaining <= threshold and key not in sent:
                action = "renews automatically" if sub.auto_renew else "expires"
                subject = f"Your {plan.name} plan {action} in {days_remaining} day{'s' if days_remaining != 1 else ''}"
                body_text = (
                    f"Hi {end_user.full_name or 'there'},\n\n"
                    f"This is a reminder that your {plan.name} plan {action} on "
                    f"{expires_at.strftime('%B %d, %Y')}.\n\n"
                    f"{'Your subscription will be renewed automatically using your saved payment method.' if sub.auto_renew else 'To continue uninterrupted access, please renew before that date.'}\n\n"
                    "Thank you for being a valued subscriber."
                )
                await _send_user_email(
                    db, client=client, end_user=end_user, subject=subject, body_text=body_text,
                    event_key=f"user_subscription_reminder_{threshold}d",
                    metadata={"days_remaining": days_remaining},
                )
                sent.add(key)
                break

        sub.reminder_sent_days = ",".join(sorted(sent)) if sent else None
        await db.commit()
