"""
Subscription renewal task — GitHub Copilot-style billing workflow.

Subscription lifecycle statuses:
  active       → normal, fully paid period
  past_due     → renewal invoice created, awaiting payment (auto_renew=True)
  grace_period → subscription expired with auto_renew=False; 7-day access window
  expired      → grace period lapsed, access blocked
  trial        → free trial
  suspended    → manually suspended by superadmin
  cancelled    → explicitly cancelled

Billing flow:
  1. Pre-renewal reminders (T-14, T-7, T-3, T-1 days) via pre_renewal_reminders()
  2. At renewal (process_subscription_renewals()):
     a. Apply pending downgrade if scheduled
     b. If auto_renew=True AND stripe_customer_id exists → attempt Stripe off-session charge
        - Success: extend subscription 30 days, mark active, send receipt
        - Failure: mark past_due, set 7-day grace, send payment-link email
     c. If auto_renew=True AND no stored PM → create PENDING invoice, mark past_due, start grace
     d. If auto_renew=False → mark grace_period, start 7-day countdown, send expiry email
  3. Grace-period monitoring (process_grace_periods()):
     - 3 days before end: send escalation email
     - 1 day before end: send final warning
     - After end: mark expired, sync account state (access blocked)
"""

import asyncio
import base64
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_secret
from app.core.system_mail import send_system_email, get_platform_logo_url, get_platform_footer_text
from app.core.email_templates import generate_professional_email_html
from app.core.invoice_generator import generate_billing_receipt_pdf
from app.core.subscription import sync_client_account_state_from_subscription
from app.models.superadmin.billing import BillingStatus, SaasBilling
from app.models.superadmin.client import Client, ClientSubscription, SubscriptionStatus
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.models.superadmin.settings import SuperadminSettings

logger = logging.getLogger(__name__)

GRACE_PERIOD_DAYS = 7
RENEWAL_LOOKBACK_HOURS = 48
RENEWAL_LOOKAHEAD_HOURS = 6
_BILLING_PORTAL_URL = "{base}/admin/billing-licensing"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _invoice_number(slug: str, prefix: str = "SVRENEW") -> str:
    now = datetime.now(timezone.utc)
    return f"{prefix}-{slug.upper()}-{now.strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:8].upper()}"


def _billing_portal_url() -> str:
    base = str(settings.FRONTEND_PUBLIC_URL or "").rstrip("/")
    return _BILLING_PORTAL_URL.format(base=base)


def _renewal_idempotency_key(client: Client, sub: ClientSubscription) -> str:
    """Stable for retries of the same billing period so a crash/retry can't double-charge."""
    return hashlib.sha256(f"client-renewal-{client.id}-{sub.expires_at}".encode()).hexdigest()


def _renewal_due_window(now: datetime) -> tuple[datetime, datetime]:
    """Return the pre-charge window and its forward lookahead boundary."""
    return now - timedelta(hours=RENEWAL_LOOKBACK_HOURS), now + timedelta(hours=RENEWAL_LOOKAHEAD_HOURS)


def _should_process_renewal(sub: ClientSubscription, now: datetime) -> bool:
    """Process the current active plan when due or overdue, but not grace rows."""
    if sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL):
        return False
    if not sub.expires_at:
        return False
    expires_at = _parse_iso(sub.expires_at)
    if not expires_at:
        return False
    _, window_end = _renewal_due_window(now)
    return expires_at <= window_end


def _renewal_period_start(sub: ClientSubscription, now: datetime) -> datetime:
    """Anchor a renewal to the contractual expiry, preserving service time."""
    return _parse_iso(sub.expires_at) or now


_BILLING_CYCLE_DAYS = {"monthly": 30, "quarterly": 90, "yearly": 365}


def _billing_cycle(sub: ClientSubscription) -> str:
    cycle = str(sub.billing_cycle or "monthly").lower()
    return cycle if cycle in _BILLING_CYCLE_DAYS else "monthly"


def _cycle_price(plan: SaasSubscriptionPlan, cycle: str) -> float:
    return float({
        "monthly": plan.price_monthly,
        "quarterly": plan.price_quarterly,
        "yearly": plan.price_yearly,
    }.get(cycle) or plan.price_monthly)


def _renewal_period_end(period_start: datetime, cycle: str) -> datetime:
    return period_start + timedelta(days=_BILLING_CYCLE_DAYS[cycle])


def _renewal_source_marker(sub: ClientSubscription) -> str:
    return f"auto_renewal_of_subscription:{sub.id}"


async def _stripe_cfg(db: AsyncSession) -> dict:
    row = (await db.execute(select(SuperadminSettings).limit(1))).scalar_one_or_none()
    cfg = (row.config if row and row.config else {})
    return cfg.get("payment_gateway", {}).get("stripe", {})


async def _paypal_cfg(db: AsyncSession) -> dict:
    row = (await db.execute(select(SuperadminSettings).limit(1))).scalar_one_or_none()
    cfg = (row.config if row and row.config else {})
    return cfg.get("payment_gateway", {}).get("paypal", {})


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


def _make_renewal_billing(
    client_id: uuid.UUID,
    plan: SaasSubscriptionPlan,
    now: datetime,
    notes: str,
    status: BillingStatus = BillingStatus.PENDING,
    transaction_id: str | None = None,
    payment_method: str | None = None,
    slug: str = "client",
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    billing_cycle: str = "monthly",
) -> SaasBilling:
    billing_start = period_start or now
    billing_end = period_end or (billing_start + timedelta(days=_BILLING_CYCLE_DAYS[billing_cycle]))
    price = _cycle_price(plan, billing_cycle)
    return SaasBilling(
        client_id=client_id,
        plan_id=plan.id,
        invoice_number=_invoice_number(slug),
        amount=price,
        currency=plan.currency,
        status=status,
        billing_period_start=billing_start.isoformat(),
        billing_period_end=billing_end.isoformat(),
        paid_at=now.isoformat() if status == BillingStatus.PAID else None,
        payment_method=payment_method,
        transaction_id=transaction_id,
        subtotal=price,
        overage_total=0,
        discount_amount=0,
        tax_amount=0,
        total_due=price,
        proration_factor=1,
        finalized_at=now.isoformat(),
        notes=notes,
    )


async def _send_email(
    db: AsyncSession,
    *,
    client: Client,
    subject: str,
    body_text: str,
    event_key: str,
    metadata: dict | None = None,
    billing: SaasBilling | None = None,
    plan_name: str | None = None,
) -> None:
    try:
        logo_url = await get_platform_logo_url()
        platform_name = settings.APP_NAME or "StreamTVDepot"
        footer_text = await get_platform_footer_text(db)
        html = generate_professional_email_html(
            subject=subject,
            body_text=body_text,
            logo_url=logo_url,
            company_name=platform_name,
            footer_text=footer_text,
        )

        attachments = None
        if billing is not None and billing.status == BillingStatus.PAID:
            try:
                pdf = generate_billing_receipt_pdf(
                    invoice_number=billing.invoice_number,
                    created_at=billing.created_at.isoformat() if billing.created_at else None,
                    paid_at=billing.paid_at,
                    amount=float(billing.amount),
                    currency=billing.currency,
                    status="paid",
                    plan_name=plan_name,
                    period_start=billing.billing_period_start,
                    period_end=billing.billing_period_end,
                    transaction_id=billing.transaction_id,
                    payment_method=billing.payment_method,
                    issuer_footer=platform_name,
                    logo_url=logo_url,
                )
                attachments = [(f"invoice-{billing.invoice_number}.pdf", pdf.getvalue(), "pdf")]
            except Exception:
                logger.exception("Invoice PDF attachment generation failed for client %s", client.id)

        await send_system_email(
            db,
            event_key=event_key,
            to_email=client.email,
            to_name=client.email,
            subject=subject,
            body_text=body_text,
            body_html=html,
            metadata=metadata or {"client_id": str(client.id)},
            attachments=attachments,
        )
    except Exception:
        logger.exception("Email send failed for client %s (event=%s)", client.id, event_key)


# ── Pre-renewal reminders ─────────────────────────────────────────────────────

async def pre_renewal_reminders(db: AsyncSession) -> None:
    """Queue tenant SaaS renewal reminders for notification workers."""
    result = await db.execute(
        select(Client.id)
        .join(ClientSubscription, ClientSubscription.client_id == Client.id)
        .where(ClientSubscription.status == SubscriptionStatus.ACTIVE, ClientSubscription.expires_at.isnot(None))
        .order_by(ClientSubscription.expires_at.asc())
        .limit(settings.REMINDER_DISPATCH_BATCH_SIZE)
    )
    from app.tasks.notification_worker import process_client_subscription_reminder_task
    client_ids = [row[0] for row in result.all()]
    for client_id in client_ids:
        process_client_subscription_reminder_task.apply_async(
            args=[str(client_id)],
            task_id=f"client-subscription-reminder:{client_id}",
        )

    if client_ids:
        logger.info("Queued %s client subscription renewal reminders", len(client_ids))


async def process_client_subscription_reminder_by_id(client_id: uuid.UUID) -> None:
    """Revalidate and send the currently eligible reminder for one client."""
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(Client, ClientSubscription)
            .join(ClientSubscription, ClientSubscription.client_id == Client.id)
            .where(Client.id == client_id)
            .with_for_update(of=ClientSubscription)
        )).first()
        if row is None:
            return

        client, sub = row
        plan = (await db.execute(
            select(SaasSubscriptionPlan).where(SaasSubscriptionPlan.id == sub.plan_id)
        )).scalar_one_or_none()
        if sub.status != SubscriptionStatus.ACTIVE or plan is None or not sub.expires_at:
            return

        expires_at = _parse_iso(sub.expires_at)
        if not expires_at:
            return

        now = datetime.now(timezone.utc)
        days_remaining = (expires_at - now).days
        sent = set((sub.reminder_sent_days or "").split(",")) - {""}
        portal = _billing_portal_url()

        for threshold in (1, 3, 7, 14):
            key = str(threshold)
            if days_remaining <= threshold and key not in sent:
                action = "renews automatically" if sub.auto_renew else "expires"
                subject = f"Your {plan.name} plan {action} in {days_remaining} day{'s' if days_remaining != 1 else ''}"
                body_text = (
                    f"Hi {client.email},\n\n"
                    f"This is a reminder that your {plan.name} plan {action} on "
                    f"{expires_at.strftime('%B %d, %Y')}.\n\n"
                    f"{'Your subscription will be renewed automatically and an invoice will be sent.' if sub.auto_renew else 'To continue uninterrupted access, please renew your plan before that date.'}\n\n"
                    f"Manage your subscription: {portal}\n\n"
                    "Thank you for being a valued customer."
                )
                await _send_email(
                    db, client=client, subject=subject, body_text=body_text,
                    event_key=f"subscription_reminder_{threshold}d",
                    metadata={"client_id": str(client.id), "days_remaining": days_remaining},
                )
                sent.add(key)
                break

        sub.reminder_sent_days = ",".join(sorted(sent)) if sent else None
        await db.commit()


# ── Main renewal processor ────────────────────────────────────────────────────

async def process_subscription_renewals(db: AsyncSession) -> None:
    """Process subscriptions that are expiring or have just expired.

    This is intentionally narrow: only the current active/trial subscription is
    eligible, and only when it is within the renewal window. That prevents the
    scheduler from double-processing a billing period or touching a row already
    moved to past_due/grace_period.
    """
    now = datetime.now(timezone.utc)
    window_end = (now + timedelta(hours=RENEWAL_LOOKAHEAD_HOURS)).isoformat()

    result = await db.execute(
        select(Client.id)
        .join(ClientSubscription, ClientSubscription.client_id == Client.id)
        .where(
            ClientSubscription.expires_at.isnot(None),
            ClientSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
            ClientSubscription.expires_at <= window_end,
        )
    )
    client_ids = [row[0] for row in result.all()]

    # Each client is processed in its own session/transaction so one failure
    # can never roll back — or get entangled with — another client's
    # already-successful charge in the same batch run.
    failures: list[tuple[uuid.UUID, str]] = []
    for client_id in client_ids:
        try:
            async with AsyncSessionLocal() as item_db:
                await _process_one_renewal_by_client_id(client_id, now, item_db)
                await item_db.commit()
        except Exception as exc:
            logger.exception("Renewal failed for client %s", client_id)
            failures.append((client_id, str(exc)))

    if failures:
        raise RuntimeError(f"{len(failures)} SaaS renewal(s) failed: {failures[:5]}")


async def _process_one_renewal_by_client_id(client_id: uuid.UUID, now: datetime, db: AsyncSession) -> None:
    sub_result = await db.execute(
        select(ClientSubscription)
        .where(ClientSubscription.client_id == client_id)
        .options(selectinload(ClientSubscription.plan))
        .with_for_update()
    )
    sub = sub_result.scalar_one_or_none()
    if not sub or not sub.expires_at:
        return
    if not _should_process_renewal(sub, now):
        return
    # Once a subscription is moved into past_due or grace_period, it is no longer
    # eligible for a fresh renewal attempt in the same billing cycle.
    if sub.status in (SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD):
        return

    client_result = await db.execute(select(Client).where(Client.id == client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        return

    await _process_one_renewal(client, sub, now, db)


async def _process_one_renewal(
    client: Client,
    sub: ClientSubscription,
    now: datetime,
    db: AsyncSession,
) -> None:
    plan = sub.plan
    if not plan:
        logger.warning("Client %s has no plan — skipping", client.id)
        return

    # A trial is a one-time entitlement. Its expiry requires a paid plan choice,
    # never a renewal invoice or another trial period.
    if plan.is_trial:
        sub.status = SubscriptionStatus.EXPIRED
        sub.auto_renew = False
        sub.grace_period_ends_at = None
        sub.reminder_sent_days = None
        await sync_client_account_state_from_subscription(client.id, db)
        await _send_email(
            db,
            client=client,
            subject="Your trial has ended — choose a plan to continue",
            body_text=(
                f"Hi {client.email},\n\n"
                f"Your {plan.name} trial has ended. Choose a paid plan to continue using StreamTVDepot.\n\n"
                f"View plans: {_billing_portal_url()}\n\n"
                "Thank you for trying StreamTVDepot."
            ),
            event_key="subscription_trial_expired",
            metadata={"client_id": str(client.id), "plan_id": str(plan.id)},
        )
        return

    # ── Apply scheduled downgrade ─────────────────────────────────────────────
    effective_plan = plan
    if sub.pending_downgrade_plan_id:
        pd = (await db.execute(
            select(SaasSubscriptionPlan).where(
                SaasSubscriptionPlan.id == sub.pending_downgrade_plan_id,
                SaasSubscriptionPlan.is_active.is_(True),
                SaasSubscriptionPlan.deleted_at.is_(None),
            )
        )).scalar_one_or_none()
        if pd:
            effective_plan = pd
            sub.plan_id = pd.id
            sub.pending_downgrade_plan_id = None
            sub.pending_downgrade_requested_at = None
            logger.info("Downgrade applied for client %s: %s → %s", client.id, plan.name, pd.name)

    period_start = _renewal_period_start(sub, now)
    billing_cycle = _billing_cycle(sub)
    if billing_cycle == "quarterly" and effective_plan.price_quarterly is None:
        logger.warning("Client %s plan no longer supports quarterly billing; reverting to monthly", client.id)
        billing_cycle = "monthly"
        sub.billing_cycle = billing_cycle
    elif billing_cycle == "yearly" and effective_plan.price_yearly is None:
        logger.warning("Client %s plan no longer supports yearly billing; reverting to monthly", client.id)
        billing_cycle = "monthly"
        sub.billing_cycle = billing_cycle
    new_expires = _renewal_period_end(period_start, billing_cycle)

    # ── Attempt Stripe auto-charge if customer ID is stored ───────────────────
    if sub.auto_renew and client.stripe_customer_id:
        charged = await _attempt_stripe_charge(client, sub, effective_plan, period_start, new_expires, db)
        if charged:
            return

    # ── Attempt PayPal auto-charge if vault token is stored ──────────────────
    if sub.auto_renew and client.paypal_vault_id:
        charged = await _attempt_paypal_charge(client, sub, effective_plan, period_start, new_expires, db)
        if charged:
            return

    # ── No stored PM: create pending invoice + enter past_due/grace_period ───
    new_status = SubscriptionStatus.PAST_DUE if sub.auto_renew else SubscriptionStatus.GRACE_PERIOD
    grace_ends = now + timedelta(days=GRACE_PERIOD_DAYS)

    # Preserve the current service window while the customer is in the grace period.
    # Product access remains available until grace_period_ends_at, but the past_due
    # state prevents the system from treating the subscription as fully active.
    sub.started_at = period_start.isoformat()
    sub.expires_at = new_expires.isoformat()
    sub.status = new_status
    sub.grace_period_ends_at = grace_ends.isoformat()
    sub.reminder_sent_days = None

    was_downgrade = effective_plan.id != plan.id
    billing = _make_renewal_billing(
        client.id, effective_plan, now,
        notes=(
            f"{_renewal_source_marker(sub)}; Renewal invoice ({new_status})"
            f"{' — downgraded from ' + plan.name if was_downgrade else ''}"
        ),
        slug=client.slug,
        period_start=period_start,
        period_end=new_expires,
        billing_cycle=billing_cycle,
    )
    db.add(billing)
    await sync_client_account_state_from_subscription(client.id, db)

    portal = _billing_portal_url()
    downgrade_note = f" (downgraded from {plan.name})" if was_downgrade else ""

    if sub.auto_renew:
        subject = f"Action required: pay your {effective_plan.name} renewal invoice{downgrade_note}"
        body_text = (
            f"Hi {client.email},\n\n"
            f"Your {effective_plan.name} plan has been renewed{downgrade_note}.\n"
            f"Invoice #{billing.invoice_number} for "
            f"{_cycle_price(effective_plan, billing_cycle):.2f} {effective_plan.currency} is awaiting payment.\n\n"
            f"Please complete payment within {GRACE_PERIOD_DAYS} days to avoid service interruption.\n\n"
            f"Pay now: {portal}\n\n"
            "Thank you for your business."
        )
        event_key = "subscription_renewal_invoice_due"
    else:
        subject = (
            f"Your {effective_plan.name} plan has expired "
            f"— {GRACE_PERIOD_DAYS}-day grace period active"
        )
        body_text = (
            f"Hi {client.email},\n\n"
            f"Your {effective_plan.name} plan has expired. You have a {GRACE_PERIOD_DAYS}-day grace period "
            f"(until {grace_ends.strftime('%B %d, %Y')}) to renew before access is suspended.\n\n"
            f"Renew now: {portal}\n\n"
            "Thank you for your business."
        )
        event_key = "subscription_expired_grace_period"

    await _send_email(
        db, client=client, subject=subject, body_text=body_text, event_key=event_key,
        metadata={"client_id": str(client.id), "billing_id": str(billing.id)},
    )


async def _attempt_stripe_charge(
    client: Client,
    sub: ClientSubscription,
    plan: SaasSubscriptionPlan,
    now: datetime,
    new_expires: datetime,
    db: AsyncSession,
) -> bool:
    """
    Try to charge the stored Stripe Customer off-session.
    Returns True if payment succeeded and subscription was extended.
    """
    stripe_cfg = await _stripe_cfg(db)
    secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
    if not secret_key_encrypted:
        return False

    stripe.api_key = decrypt_secret(secret_key_encrypted)
    customer_id = client.stripe_customer_id
    billing_cycle = _billing_cycle(sub)
    price = _cycle_price(plan, billing_cycle)

    try:
        payment_methods = await asyncio.to_thread(
            stripe.PaymentMethod.list, customer=customer_id, type="card"
        )
        if not payment_methods.data:
            logger.info("No saved payment methods for Stripe customer %s", customer_id)
            return False

        pm = payment_methods.data[0]
        amount_minor = max(int(round(price * 100)), 1)

        intent = await asyncio.to_thread(
            stripe.PaymentIntent.create,
            amount=amount_minor,
            currency=str(plan.currency or "USD").lower(),
            customer=customer_id,
            payment_method=pm.id,
            off_session=True,
            confirm=True,
            description=f"Auto-renewal: {plan.name} — {client.email}",
            metadata={"client_id": str(client.id), "plan_id": str(plan.id)},
            idempotency_key=_renewal_idempotency_key(client, sub),
        )
    except stripe.error.CardError as e:
        logger.warning("Card declined for client %s: %s", client.id, e.user_message)
        return False
    except Exception:
        logger.exception("Stripe off-session charge failed for client %s", client.id)
        return False

    if intent.status != "succeeded":
        return False

    txn_id = intent.id
    sub.started_at = now.isoformat()
    sub.expires_at = new_expires.isoformat()
    sub.status = SubscriptionStatus.ACTIVE
    sub.grace_period_ends_at = None
    sub.reminder_sent_days = None

    billing = _make_renewal_billing(
        client.id, plan, now,
        notes=f"{_renewal_source_marker(sub)}; Auto-renewal — Stripe off-session charge succeeded",
        status=BillingStatus.PAID,
        transaction_id=txn_id,
        payment_method="stripe",
        slug=client.slug,
        period_start=now,
        period_end=new_expires,
        billing_cycle=billing_cycle,
    )
    db.add(billing)
    await sync_client_account_state_from_subscription(client.id, db)

    portal = _billing_portal_url()
    subject = f"Payment received — {plan.name} renewed until {new_expires.strftime('%B %d, %Y')}"
    body_text = (
        f"Hi {client.email},\n\n"
        f"Your {plan.name} subscription has been automatically renewed.\n"
        f"Invoice: {billing.invoice_number}\n"
        f"Amount charged: {price:.2f} {plan.currency}\n"
        f"Transaction ID: {txn_id}\n"
        f"Active until: {new_expires.strftime('%B %d, %Y')}\n\n"
        f"View invoice: {portal}\n\n"
        "Thank you for your continued subscription."
    )
    await _send_email(
        db, client=client, subject=subject, body_text=body_text,
        event_key="subscription_auto_renewed",
        metadata={"client_id": str(client.id), "transaction_id": txn_id},
        billing=billing, plan_name=plan.name,
    )
    logger.info("Auto-renewed client %s via Stripe (txn %s)", client.id, txn_id)
    return True


async def _attempt_paypal_charge(
    client: Client,
    sub: ClientSubscription,
    plan: SaasSubscriptionPlan,
    now: datetime,
    new_expires: datetime,
    db: AsyncSession,
) -> bool:
    """
    Charge the stored PayPal Vault token off-session (PCI-compliant: no card data on server).
    Uses the PayPal Orders v2 API with payment_source.token (vault payment method token).
    Returns True if payment succeeded and subscription was extended.
    """
    paypal_cfg = await _paypal_cfg(db)
    pp_client_id = paypal_cfg.get("client_id")
    pp_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
    if not pp_client_id or not pp_secret_encrypted:
        return False

    vault_id = client.paypal_vault_id
    billing_cycle = _billing_cycle(sub)
    price = _cycle_price(plan, billing_cycle)
    pp_secret = decrypt_secret(pp_secret_encrypted)
    sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"

    try:
        access_token = await _paypal_access_token(pp_client_id, pp_secret, sandbox)

        async with httpx.AsyncClient() as http:
            # Create order using vault token — no buyer redirect required
            resp = await http.post(
                f"{base_url}/v2/checkout/orders",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                    # Stable per billing period so a crash/retry can't double-charge
                    "PayPal-Request-Id": _renewal_idempotency_key(client, sub),
                },
                json={
                    "intent": "CAPTURE",
                    "purchase_units": [{
                        "amount": {
                            "currency_code": str(plan.currency or "USD").upper(),
                            "value": f"{price:.2f}",
                        },
                        "description": f"Auto-renewal: {plan.name}",
                        "custom_id": str(client.id),
                    }],
                    "payment_source": {
                        "token": {
                            "id": vault_id,
                            "type": "PAYMENT_METHOD_TOKEN",
                        }
                    },
                },
                timeout=20,
            )
            if resp.status_code not in (200, 201):
                logger.warning(
                    "PayPal vault charge rejected for client %s: %s %s",
                    client.id, resp.status_code, resp.text[:200],
                )
                return False

            order = resp.json()
            order_id = order.get("id")
            order_status = order.get("status")

            # Vault orders may auto-complete; capture if still in APPROVED state
            if order_status == "APPROVED":
                capture_resp = await http.post(
                    f"{base_url}/v2/checkout/orders/{order_id}/capture",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    timeout=20,
                )
                if capture_resp.status_code not in (200, 201):
                    logger.warning("PayPal capture failed for client %s", client.id)
                    return False
                order = capture_resp.json()
                order_status = order.get("status")

    except Exception:
        logger.exception("PayPal vault charge failed for client %s", client.id)
        return False

    if order_status != "COMPLETED":
        logger.warning("PayPal order not completed for client %s (status=%s)", client.id, order_status)
        return False

    capture_obj = (
        order.get("purchase_units", [{}])[0]
        .get("payments", {})
        .get("captures", [{}])[0]
    )
    capture_amount = capture_obj.get("amount", {})
    if (
        capture_obj.get("status") != "COMPLETED"
        or round(float(capture_amount.get("value", 0)), 2) != round(price, 2)
        or str(capture_amount.get("currency_code") or "").upper() != str(plan.currency or "USD").upper()
    ):
        logger.warning("PayPal capture validation failed for client %s", client.id)
        return False
    txn_id = capture_obj.get("id", order_id)

    sub.started_at = now.isoformat()
    sub.expires_at = new_expires.isoformat()
    sub.status = SubscriptionStatus.ACTIVE
    sub.grace_period_ends_at = None
    sub.reminder_sent_days = None

    billing = _make_renewal_billing(
        client.id, plan, now,
        notes=f"{_renewal_source_marker(sub)}; Auto-renewal — PayPal Vault off-session charge succeeded",
        status=BillingStatus.PAID,
        transaction_id=txn_id,
        payment_method="paypal",
        slug=client.slug,
        period_start=now,
        period_end=new_expires,
        billing_cycle=billing_cycle,
    )
    db.add(billing)
    await sync_client_account_state_from_subscription(client.id, db)

    portal = _billing_portal_url()
    subject = f"Payment received — {plan.name} renewed until {new_expires.strftime('%B %d, %Y')}"
    body_text = (
        f"Hi {client.email},\n\n"
        f"Your {plan.name} subscription has been automatically renewed via PayPal.\n"
        f"Invoice: {billing.invoice_number}\n"
        f"Amount charged: {price:.2f} {plan.currency}\n"
        f"Transaction ID: {txn_id}\n"
        f"Active until: {new_expires.strftime('%B %d, %Y')}\n\n"
        f"View invoice: {portal}\n\n"
        "Thank you for your continued subscription."
    )
    await _send_email(
        db, client=client, subject=subject, body_text=body_text,
        event_key="subscription_auto_renewed_paypal",
        metadata={"client_id": str(client.id), "transaction_id": txn_id},
        billing=billing, plan_name=plan.name,
    )
    logger.info("Auto-renewed client %s via PayPal Vault (txn %s)", client.id, txn_id)
    return True


# ── Grace-period monitoring ───────────────────────────────────────────────────

async def process_grace_periods(db: AsyncSession) -> None:
    """Escalation emails during grace period and final access suspension."""
    result = await db.execute(
        select(Client.id)
        .join(ClientSubscription, ClientSubscription.client_id == Client.id)
        .where(
            ClientSubscription.status.in_([SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD]),
            ClientSubscription.grace_period_ends_at.isnot(None),
        )
    )
    client_ids = [row[0] for row in result.all()]

    # Each client is processed in its own session/transaction so one failure
    # can't roll back another client's suspension/reminder-tracking update.
    for client_id in client_ids:
        try:
            async with AsyncSessionLocal() as item_db:
                await _process_one_grace_period_by_client_id(client_id, item_db)
                await item_db.commit()
        except Exception:
            logger.exception("Grace-period processing failed for client %s", client_id)


async def _process_one_grace_period_by_client_id(client_id: uuid.UUID, db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Client)
        .where(Client.id == client_id)
        .options(selectinload(Client.subscription).selectinload(ClientSubscription.plan))
    )
    client = result.scalar_one_or_none()
    if not client or not client.subscription:
        return
    sub = client.subscription
    if sub.status not in (SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD) or not sub.grace_period_ends_at:
        return
    portal = _billing_portal_url()

    grace_ends = _parse_iso(sub.grace_period_ends_at)
    if not grace_ends:
        return
    plan_name = sub.plan.name if sub.plan else "your plan"
    sent = set((sub.reminder_sent_days or "").split(",")) - {""}

    if grace_ends <= now:
        sub.status = SubscriptionStatus.EXPIRED
        sub.grace_period_ends_at = None
        await sync_client_account_state_from_subscription(client.id, db)
        subject = f"Access suspended — {plan_name} subscription expired"
        body_text = (
            f"Hi {client.email},\n\n"
            "Your grace period has ended and access has been suspended due to an unpaid invoice.\n\n"
            f"To restore access, complete payment at: {portal}\n\n"
            "Your data is preserved. Access is restored immediately upon payment."
        )
        await _send_email(db, client=client, subject=subject, body_text=body_text,
                          event_key="subscription_access_suspended")
        logger.info("Suspended client %s — grace period lapsed", client.id)
        return

    days_left = (grace_ends - now).days

    if days_left <= 1 and "grace_1" not in sent:
        subject = f"Final notice: access suspended tomorrow — {plan_name}"
        body_text = (
            f"Hi {client.email},\n\n"
            "Your grace period ends tomorrow. Access will be suspended unless payment is received.\n\n"
            f"Pay now: {portal}"
        )
        await _send_email(db, client=client, subject=subject, body_text=body_text,
                          event_key="subscription_grace_final_warning")
        sent.add("grace_1")
    elif days_left <= 3 and "grace_3" not in sent:
        subject = f"Urgent: {days_left} day{'s' if days_left != 1 else ''} left to renew — {plan_name}"
        body_text = (
            f"Hi {client.email},\n\n"
            f"You have {days_left} days remaining in your grace period before access is suspended.\n\n"
            f"Renew now: {portal}"
        )
        await _send_email(db, client=client, subject=subject, body_text=body_text,
                          event_key="subscription_grace_escalation")
        sent.add("grace_3")

    sub.reminder_sent_days = ",".join(sorted(sent)) if sent else None
