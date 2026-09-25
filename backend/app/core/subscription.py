"""
Shared subscription helpers used by both the SAAS registration flow and the
superadmin client-creation endpoint.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.superadmin.client import Client, ClientStatus, ClientSubscription, SubscriptionStatus
from app.models.superadmin.billing import BillingStatus, SaasBilling
from app.models.superadmin.plan import SaasSubscriptionPlan


async def ensure_trial_subscription(client_id: uuid.UUID, db: AsyncSession) -> bool:
    """Assign a 30-day trial subscription and paid $0 trial invoice if absent.

    Returns True when a subscription is active/assigned after the call,
    False when no active trial plan is configured in the platform.
    """
    client = (await db.execute(
        select(Client).where(Client.id == client_id)
    )).scalar_one_or_none()
    if client is None:
        return False

    existing = await db.execute(
        select(ClientSubscription).where(ClientSubscription.client_id == client_id)
    )
    subscription = existing.scalar_one_or_none()
    if subscription is not None:
        if subscription.status == SubscriptionStatus.TRIAL:
            await _ensure_trial_billing_record(client, subscription, db)
        return True  # already has a subscription

    trial_plan = (await db.execute(
        select(SaasSubscriptionPlan)
        .where(
            SaasSubscriptionPlan.is_trial.is_(True),
            SaasSubscriptionPlan.is_active.is_(True),
            SaasSubscriptionPlan.deleted_at.is_(None),
        )
        .order_by(SaasSubscriptionPlan.created_at.asc())
        .limit(1)
    )).scalar_one_or_none()

    if trial_plan is None:
        return False  # no trial plan configured

    now = datetime.now(timezone.utc)
    subscription = ClientSubscription(
        client_id=client_id,
        plan_id=trial_plan.id,
        status=SubscriptionStatus.TRIAL,
        started_at=now.isoformat(),
        expires_at=(now + timedelta(days=30)).isoformat(),
        auto_renew=False,
    )
    db.add(subscription)
    await db.flush()
    await _ensure_trial_billing_record(client, subscription, db)
    return True


async def _ensure_trial_billing_record(
    client: Client,
    subscription: ClientSubscription,
    db: AsyncSession,
) -> None:
    existing = (await db.execute(
        select(SaasBilling.id).where(
            SaasBilling.client_id == client.id,
            SaasBilling.plan_id == subscription.plan_id,
            SaasBilling.status == BillingStatus.PAID,
            SaasBilling.amount == 0,
            SaasBilling.notes == "Client-admin signup trial",
        ).limit(1)
    )).scalar_one_or_none()
    if existing:
        return

    now = datetime.now(timezone.utc)
    db.add(SaasBilling(
        client_id=client.id,
        plan_id=subscription.plan_id,
        invoice_number=f"SVTRIAL-{client.slug.upper()}-{now.strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:8].upper()}",
        amount=0,
        currency="USD",
        status=BillingStatus.PAID,
        billing_period_start=subscription.started_at,
        billing_period_end=subscription.expires_at,
        paid_at=now.isoformat(),
        payment_method="trial",
        transaction_id="trial-signup",
        subtotal=0,
        overage_total=0,
        discount_amount=0,
        tax_amount=0,
        total_due=0,
        finalized_at=now.isoformat(),
        notes="Client-admin signup trial",
    ))
    await db.flush()


async def sync_client_account_state_from_subscription(
    client_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """
    Canonical account-state sync rules:
    - Trial mode: status=trial, is_active=True
    - Any non-trial subscription: status=active, is_active=True
    - No subscription: status=inactive, is_active=True
    - Suspended: status=suspended, is_active=False (manual hold)
    - Archived: status=inactive, is_active=False (manual archive)

    Manual blocked states (suspended/archived) are preserved.
    """
    client = (
        await db.execute(select(Client).where(Client.id == client_id))
    ).scalar_one_or_none()
    if not client:
        return

    # Preserve manual blocked states.
    if client.status == ClientStatus.SUSPENDED and client.is_active is False:
        return
    if client.status == ClientStatus.INACTIVE and client.is_active is False:
        return

    subscription = (
        await db.execute(
            select(ClientSubscription).where(ClientSubscription.client_id == client_id)
        )
    ).scalar_one_or_none()

    if subscription is None:
        client.status = ClientStatus.INACTIVE
        client.is_active = True
        await db.flush()
        return

    plan = (
        await db.execute(
            select(SaasSubscriptionPlan).where(SaasSubscriptionPlan.id == subscription.plan_id)
        )
    ).scalar_one_or_none()

    # subscription.status is always a SubscriptionStatus member once loaded via the ORM
    is_trial_subscription = (
        (subscription.status == SubscriptionStatus.TRIAL)
        or (bool(plan.is_trial) if plan else False)
    )

    if subscription.status in (SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED):
        # Account accessible but subscription lapsed — user can log in to pay
        client.status = ClientStatus.INACTIVE
        client.is_active = True
    elif subscription.status in (SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD):
        # Grace window: do not restrict product access until the grace period ends.
        client.status = ClientStatus.ACTIVE
        client.is_active = True
    elif is_trial_subscription:
        client.status = ClientStatus.TRIAL
        client.is_active = True
    elif subscription.status == SubscriptionStatus.PAUSED:
        client.status = ClientStatus.INACTIVE
        client.is_active = False
    else:
        client.status = ClientStatus.ACTIVE
        client.is_active = True
    await db.flush()
