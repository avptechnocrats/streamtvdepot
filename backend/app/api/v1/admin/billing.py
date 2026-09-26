import asyncio
import base64
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
import stripe
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import StreamingResponse

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.security import decrypt_secret
from app.core.system_mail import send_system_email, get_platform_logo_url, get_platform_footer_text
from app.core.subscription import sync_client_account_state_from_subscription
from app.core.email_templates import generate_professional_email_html
from app.core.invoice_generator import generate_billing_invoice_pdf, generate_billing_receipt_pdf
from app.models.client.payment import Invoice
from app.models.superadmin.billing import BillingStatus, SaasBilling
from app.models.superadmin.client import Client, ClientSubscription, SubscriptionStatus
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.models.superadmin.settings import SuperadminSettings

router = APIRouter()


def _as_float(value: Decimal | float | int | None, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _safe_plan_slug(plan_name: str) -> str:
    return "".join(ch for ch in plan_name.lower().replace(" ", "-") if ch.isalnum() or ch == "-") or "plan"


def _calc_proration(
    current_monthly: float,
    new_monthly: float,
    started_at: datetime | None,
    expires_at: datetime | None,
) -> tuple[float, float]:
    """
    Returns (credit, charge).
    Uses remaining ratio of the current cycle against current plan monthly price.
    """
    now = datetime.now(timezone.utc)
    if new_monthly <= current_monthly:
        return 0.0, 0.0

    if not started_at or not expires_at or expires_at <= now:
        return 0.0, round(new_monthly - current_monthly, 2)

    total_seconds = max((expires_at - started_at).total_seconds(), 1.0)
    remaining_seconds = max((expires_at - now).total_seconds(), 0.0)
    remaining_ratio = min(max(remaining_seconds / total_seconds, 0.0), 1.0)
    credit = round(current_monthly * remaining_ratio, 2)
    charge = round(max(new_monthly - credit, 0.0), 2)
    return credit, charge


def _build_invoice_number(client_slug: str) -> str:
    now = datetime.now(timezone.utc)
    suffix = str(uuid.uuid4())[:8].upper()
    return f"SVUP-{client_slug.upper()}-{now.strftime('%Y%m%d%H%M%S')}-{suffix}"


def _is_valid_active_subscription(subscription: ClientSubscription | None) -> bool:
    if not subscription:
        return False
    # Include trial and grace-period states so the client still sees their plan info
    valid_statuses = {
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.TRIAL,
        SubscriptionStatus.PAST_DUE,
        SubscriptionStatus.GRACE_PERIOD,
    }
    if subscription.status not in valid_statuses:
        return False
    return True


async def _get_superadmin_gateway_cfg(db: AsyncSession) -> tuple[dict, dict, dict, dict]:
    settings_result = await db.execute(select(SuperadminSettings).limit(1))
    row = settings_result.scalar_one_or_none()
    config = (row.config if row and row.config else {})
    payment_gateway = config.get("payment_gateway") or config.get("payment_gateways") or {}
    stripe_cfg = payment_gateway.get("stripe", {})
    paypal_cfg = payment_gateway.get("paypal", {})
    razorpay_cfg = payment_gateway.get("razorpay", {})
    cashfree_cfg = payment_gateway.get("cashfree", {})
    return stripe_cfg, paypal_cfg, razorpay_cfg, cashfree_cfg


def _gateway_enabled(config: dict) -> bool:
    value = config.get("enabled", False)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


async def _paypal_access_token(client_id_str: str, client_secret: str, sandbox: bool) -> str:
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


def _expected_minor_units(amount: float) -> int:
    return int(round(amount * 100))


_BILLING_CYCLE_DAYS = {"monthly": 30, "quarterly": 90, "yearly": 365}
_GRACE_PERIOD_DAYS = 7


def _billing_cycle(value: object) -> str:
    cycle = str(value or "monthly").lower()
    if cycle not in _BILLING_CYCLE_DAYS:
        raise HTTPException(status_code=400, detail="billing_cycle must be monthly, quarterly, or yearly")
    return cycle


def _cycle_price(plan: SaasSubscriptionPlan, cycle: str) -> float:
    price = {
        "monthly": plan.price_monthly,
        "quarterly": plan.price_quarterly,
        "yearly": plan.price_yearly,
    }[cycle]
    if price is None:
        raise HTTPException(status_code=400, detail=f"{cycle.title()} billing is not available for this plan")
    return _as_float(price)


def _cycle_end(start: datetime, cycle: str) -> datetime:
    return start + timedelta(days=_BILLING_CYCLE_DAYS[cycle])


@router.get("")
async def list_client_billing(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Returns invoices generated for this client's end users."""
    result = await db.execute(
        select(Invoice)
        .where(Invoice.client_id == admin._client_id)
        .order_by(Invoice.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    invoices = result.scalars().all()
    return {"invoices": [{"id": str(i.id), "invoice_number": i.invoice_number, "amount": i.amount, "currency": i.currency, "issued_at": i.issued_at} for i in invoices]}


@router.get("/licensing")
async def get_client_billing_licensing(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client_result = await db.execute(
        select(Client)
        .where(Client.id == admin._client_id)
        .options(selectinload(Client.subscription).selectinload(ClientSubscription.plan))
    )
    client = client_result.scalar_one_or_none()
    if not client:
        stripe_cfg, paypal_cfg, razorpay_cfg, cashfree_cfg = await _get_superadmin_gateway_cfg(db)
        return {
            "client_id": str(admin._client_id),
            "current_plan": None,
            "upgrade_options": [],
            "available_gateways": {
                "stripe": _gateway_enabled(stripe_cfg),
                "paypal": _gateway_enabled(paypal_cfg),
                "razorpay": _gateway_enabled(razorpay_cfg),
                "cashfree": _gateway_enabled(cashfree_cfg),
            },
        }

    stripe_cfg, paypal_cfg, razorpay_cfg, cashfree_cfg = await _get_superadmin_gateway_cfg(db)

    all_active_plans_result = await db.execute(
        select(SaasSubscriptionPlan)
        .where(
            SaasSubscriptionPlan.is_active.is_(True),
            SaasSubscriptionPlan.deleted_at.is_(None),
            SaasSubscriptionPlan.is_trial.is_(False),
        )
        .order_by(SaasSubscriptionPlan.price_monthly.asc())
    )
    all_active_plans = all_active_plans_result.scalars().all()

    def to_plan_payload(plan: SaasSubscriptionPlan, is_current: bool = False):
        return {
            "id": str(plan.id),
            "name": plan.name,
            "slug": plan.slug or _safe_plan_slug(plan.name),
            "sub_text": plan.sub_text,
            "currency": plan.currency,
            "price_monthly": float(plan.price_monthly),
            "price_quarterly": float(plan.price_quarterly) if plan.price_quarterly is not None else None,
            "price_yearly": float(plan.price_yearly) if plan.price_yearly is not None else None,
            "description": plan.description,
            "key_features": plan.key_features or [],
            "is_trial": plan.is_trial,
            "is_current_plan": is_current,
        }

    raw_subscription = client.subscription
    # Correct trial renewal records created before trials were made one-time.
    # A trial may expire, but it must never leave a payable renewal invoice.
    if (
        raw_subscription
        and raw_subscription.plan
        and raw_subscription.plan.is_trial
        and raw_subscription.status in (SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD)
    ):
        legacy_trial_billings = (await db.execute(
            select(SaasBilling).where(
                SaasBilling.client_id == client.id,
                SaasBilling.plan_id == raw_subscription.plan_id,
                SaasBilling.status == BillingStatus.PENDING,
                SaasBilling.amount == 0,
            )
        )).scalars().all()
        for billing in legacy_trial_billings:
            billing.status = BillingStatus.CANCELLED
            billing.notes = f"{billing.notes or ''}; Cancelled: trials do not renew".strip("; ")
        raw_subscription.status = SubscriptionStatus.EXPIRED
        raw_subscription.auto_renew = False
        raw_subscription.grace_period_ends_at = None
        await sync_client_account_state_from_subscription(client.id, db)
        await db.commit()
    current_subscription = raw_subscription if (
        _is_valid_active_subscription(raw_subscription)
        or (
            raw_subscription
            and raw_subscription.status in (
                SubscriptionStatus.PAST_DUE,
                SubscriptionStatus.GRACE_PERIOD,
                SubscriptionStatus.EXPIRED,
                SubscriptionStatus.CANCELLED,
            )
        )
    ) else None
    current_plan = None
    current_price_monthly = None
    if current_subscription and current_subscription.plan:
        current_plan_model = current_subscription.plan
        service_period_started_at = current_subscription.started_at
        service_period_ends_at = current_subscription.expires_at
        if current_subscription.status in (SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD):
            pending_billing = (await db.execute(
                select(SaasBilling)
                .where(
                    SaasBilling.client_id == client.id,
                    SaasBilling.status == BillingStatus.PENDING,
                )
                .order_by(SaasBilling.created_at.desc())
                .limit(1)
            )).scalar_one_or_none()
            if pending_billing:
                service_period_ends_at = pending_billing.billing_period_start or service_period_ends_at
                previous_billing = (await db.execute(
                    select(SaasBilling)
                    .where(
                        SaasBilling.client_id == client.id,
                        SaasBilling.status == BillingStatus.PAID,
                        SaasBilling.billing_period_end <= pending_billing.billing_period_start,
                    )
                    .order_by(SaasBilling.billing_period_end.desc())
                    .limit(1)
                )).scalar_one_or_none()
                service_period_started_at = (
                    previous_billing.billing_period_start
                    if previous_billing and previous_billing.billing_period_start
                    else current_subscription.created_at.isoformat()
                )

                grace_period_ends_at = _parse_iso(current_subscription.grace_period_ends_at)
                expected_grace_end = pending_billing.created_at + timedelta(days=_GRACE_PERIOD_DAYS)
                if grace_period_ends_at is None or grace_period_ends_at < expected_grace_end:
                    current_subscription.grace_period_ends_at = expected_grace_end.isoformat()
                    await db.commit()
        pending_downgrade_plan_name = None
        if current_subscription.pending_downgrade_plan_id:
            pd_result = await db.execute(
                select(SaasSubscriptionPlan).where(
                    SaasSubscriptionPlan.id == current_subscription.pending_downgrade_plan_id
                )
            )
            pd_plan = pd_result.scalar_one_or_none()
            pending_downgrade_plan_name = pd_plan.name if pd_plan else None
        current_plan = {
            **to_plan_payload(current_plan_model, is_current=True),
            "status": current_subscription.status,
            "started_at": current_subscription.started_at,
            "expires_at": current_subscription.expires_at,
            "service_period_started_at": service_period_started_at,
            "service_period_ends_at": service_period_ends_at,
            "auto_renew": current_subscription.auto_renew,
            "billing_cycle": current_subscription.billing_cycle or "monthly",
            "grace_period_ends_at": current_subscription.grace_period_ends_at,
            "pending_downgrade_plan_id": str(current_subscription.pending_downgrade_plan_id) if current_subscription.pending_downgrade_plan_id else None,
            "pending_downgrade_plan_name": pending_downgrade_plan_name,
            "pending_downgrade_requested_at": current_subscription.pending_downgrade_requested_at,
        }
        if current_subscription.status not in (SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED):
            current_price_monthly = float(current_plan_model.price_monthly)

    plans = []
    for p in all_active_plans:
        is_current = bool(
            current_subscription
            and current_subscription.plan_id == p.id
            and current_subscription.status not in (SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED)
        )
        payload = to_plan_payload(p, is_current=is_current)
        current_plan_price = current_price_monthly if current_price_monthly is not None else None
        payload["can_upgrade"] = current_plan_price is None or float(p.price_monthly) > current_plan_price
        payload["can_downgrade"] = current_plan_price is not None and float(p.price_monthly) < current_plan_price
        plans.append(payload)

    upgrade_options = [p for p in plans if (p["can_upgrade"] or p["can_downgrade"]) and not p["is_current_plan"]]

    return {
        "client_id": str(client.id),
        "current_plan": current_plan,
        "plans": plans,
        "available_gateways": {
            "stripe": _gateway_enabled(stripe_cfg),
            "paypal": _gateway_enabled(paypal_cfg),
            "razorpay": _gateway_enabled(razorpay_cfg),
            "cashfree": _gateway_enabled(cashfree_cfg),
        },
    }


@router.get("/payment-history")
async def get_client_payment_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    total = await db.scalar(
        select(func.count(SaasBilling.id)).where(SaasBilling.client_id == admin._client_id)
    ) or 0
    result = await db.execute(
        select(SaasBilling, SaasSubscriptionPlan)
        .outerjoin(SaasSubscriptionPlan, SaasBilling.plan_id == SaasSubscriptionPlan.id)
        .where(SaasBilling.client_id == admin._client_id)
        .order_by(SaasBilling.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = result.all()

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            {
                "id": str(billing.id),
                "invoice_number": billing.invoice_number,
                "amount": _as_float(billing.amount),
                "currency": billing.currency,
                "status": billing.status.value,
                "payment_method": billing.payment_method,
                "transaction_id": billing.transaction_id,
                "plan_name": plan.name if plan else None,
                "period_start": billing.billing_period_start,
                "period_end": billing.billing_period_end,
                "paid_at": billing.paid_at,
                "created_at": billing.created_at,
                "notes": billing.notes,
            }
            for billing, plan in rows
        ]
    }


async def _get_billing_record(billing_id: uuid.UUID, client_id: uuid.UUID, db: AsyncSession):
    """Fetch a SaasBilling row that belongs to the given client, or raise 404."""
    result = await db.execute(
        select(SaasBilling, SaasSubscriptionPlan)
        .outerjoin(SaasSubscriptionPlan, SaasBilling.plan_id == SaasSubscriptionPlan.id)
        .where(SaasBilling.id == billing_id, SaasBilling.client_id == client_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Billing record not found")
    return row  # (SaasBilling, SaasSubscriptionPlan | None)


async def _get_issuer_footer(db: AsyncSession) -> str | None:
    """Return a one-line footer string from superadmin settings."""
    settings_row = (await db.execute(select(SuperadminSettings).limit(1))).scalar_one_or_none()
    if not settings_row:
        return None
    general = (settings_row.config or {}).get("general", {})
    parts = [p for p in [general.get("company_name"), general.get("address1"), general.get("address2")] if p]
    return "  ·  ".join(parts) if parts else None


@router.get("/payment-history/{billing_id}/invoice.pdf", tags=["Admin – Billing"])
async def download_billing_invoice(
    billing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Download a formal Invoice PDF for a SaaS billing record (no status/txn/method)."""
    billing, plan = await _get_billing_record(billing_id, admin._client_id, db)

    client_result = await db.execute(
        select(Client).where(Client.id == admin._client_id)
    )
    client = client_result.scalar_one_or_none()

    site_config = (client.site_config or {}) if client else {}
    bill_to_company = site_config.get("site_title") or (client.name if client else None)
    bill_to_address = client.address if client else None

    issuer_footer = await _get_issuer_footer(db)

    pdf = generate_billing_invoice_pdf(
        invoice_number=billing.invoice_number,
        created_at=str(billing.created_at) if billing.created_at else None,
        amount=float(billing.total_due or billing.amount),
        currency=billing.currency or "USD",
        plan_name=plan.name if plan else None,
        period_start=billing.billing_period_start,
        period_end=billing.billing_period_end,
        bill_to_name=admin.full_name,
        bill_to_company=bill_to_company,
        bill_to_address=bill_to_address,
        bill_to_vat=None,
        issuer_footer=issuer_footer,
    )

    filename = f"invoice-{billing.invoice_number}.pdf"
    return StreamingResponse(
        iter([pdf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payment-history/{billing_id}/receipt.pdf", tags=["Admin – Billing"])
async def download_billing_receipt(
    billing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Download a Receipt PDF confirming payment (includes status, txn ID, payment method)."""
    billing, plan = await _get_billing_record(billing_id, admin._client_id, db)

    if billing.status.value != "paid":
        raise HTTPException(status_code=400, detail="Receipt is only available for paid invoices")

    issuer_footer = await _get_issuer_footer(db)

    pdf = generate_billing_receipt_pdf(
        invoice_number=billing.invoice_number,
        created_at=str(billing.created_at) if billing.created_at else None,
        paid_at=billing.paid_at,
        amount=float(billing.total_due or billing.amount),
        currency=billing.currency or "USD",
        status=billing.status.value,
        plan_name=plan.name if plan else None,
        period_start=billing.billing_period_start,
        period_end=billing.billing_period_end,
        transaction_id=billing.transaction_id,
        payment_method=billing.payment_method,
        issuer_footer=issuer_footer,
    )

    filename = f"receipt-{billing.invoice_number}.pdf"
    return StreamingResponse(
        iter([pdf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/upgrade/initiate")
async def initiate_client_plan_upgrade(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    new_plan_id_raw = payload.get("new_plan_id")
    gateway = payload.get("gateway")
    billing_cycle = _billing_cycle(payload.get("billing_cycle"))
    if not new_plan_id_raw:
        raise HTTPException(status_code=400, detail="new_plan_id is required")

    try:
        new_plan_id = uuid.UUID(str(new_plan_id_raw))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="new_plan_id is invalid")

    client_result = await db.execute(
        select(Client)
        .where(Client.id == admin._client_id)
        .options(selectinload(Client.subscription).selectinload(ClientSubscription.plan))
    )
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    raw_subscription = client.subscription
    has_valid_active_subscription = _is_valid_active_subscription(raw_subscription)
    current_subscription = raw_subscription if (
        has_valid_active_subscription
        or (
            raw_subscription
            and raw_subscription.status in (SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD)
        )
    ) else None
    current_plan = current_subscription.plan if current_subscription and current_subscription.plan else None

    plan_result = await db.execute(
        select(SaasSubscriptionPlan).where(
            SaasSubscriptionPlan.id == new_plan_id,
            SaasSubscriptionPlan.is_active.is_(True),
            SaasSubscriptionPlan.deleted_at.is_(None),
        )
    )
    new_plan = plan_result.scalar_one_or_none()
    if not new_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if new_plan.is_trial:
        raise HTTPException(status_code=400, detail="Trial plans are only assigned after email verification")

    settling_overdue_invoice = bool(
        current_subscription
        and current_plan
        and new_plan.id == current_plan.id
        and current_subscription.status in (SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD)
    )
    if current_plan and new_plan.id == current_plan.id and not settling_overdue_invoice:
        raise HTTPException(status_code=400, detail="You are already on this plan")

    current_cycle = _billing_cycle(current_subscription.billing_cycle) if current_subscription else billing_cycle
    if settling_overdue_invoice:
        billing_cycle = current_cycle
    current_price = _cycle_price(current_plan, current_cycle) if current_plan else 0.0
    new_price = _cycle_price(new_plan, billing_cycle)
    if current_plan and new_price < current_price and not settling_overdue_invoice:
        raise HTTPException(
            status_code=400,
            detail="Downgrades are not allowed mid-cycle. Please change at renewal.",
        )

    if current_plan and current_subscription and not settling_overdue_invoice:
        started_at = _parse_iso(current_subscription.started_at)
        expires_at = _parse_iso(current_subscription.expires_at)
        credit, charge = _calc_proration(current_price, new_price, started_at, expires_at)
    else:
        expires_at = None
        credit, charge = 0.0, round(new_price, 2)

    now = datetime.now(timezone.utc)
    if settling_overdue_invoice:
        billing = (await db.execute(
            select(SaasBilling)
            .where(
                SaasBilling.client_id == client.id,
                SaasBilling.plan_id == new_plan.id,
                SaasBilling.status == BillingStatus.PENDING,
            )
            .order_by(SaasBilling.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        if not billing:
            raise HTTPException(status_code=404, detail="No outstanding renewal invoice found")
        charge = float(billing.amount)
    else:
        pending_billings = (await db.execute(
            select(SaasBilling)
            .where(
                SaasBilling.client_id == client.id,
                SaasBilling.status == BillingStatus.PENDING,
                SaasBilling.notes == "Client-admin plan upgrade/purchase",
            )
            .order_by(SaasBilling.created_at.desc())
        )).scalars().all()
        billing = next(
            (
                candidate for candidate in pending_billings
                if candidate.plan_id == new_plan.id
                and _billing_cycle((candidate.plan_snapshot or {}).get("billing_cycle")) == billing_cycle
                and _as_float(candidate.amount) == charge
                and str(candidate.currency or "").upper() == str(new_plan.currency or "").upper()
            ),
            None,
        )
        for candidate in pending_billings:
            if candidate is not billing:
                candidate.status = BillingStatus.CANCELLED
                candidate.finalized_at = now.isoformat()
                candidate.notes = "Client-admin plan checkout abandoned"

        if billing:
            charge = _as_float(billing.amount)
            billing.payment_method = None
            billing.transaction_id = None
        else:
            invoice_number = _build_invoice_number(client.slug)
            period_end = expires_at.isoformat() if expires_at else None
            billing = SaasBilling(
                client_id=client.id,
                plan_id=new_plan.id,
                invoice_number=invoice_number,
                amount=charge,
                currency=new_plan.currency,
                status=BillingStatus.PAID if charge == 0 else BillingStatus.PENDING,
                billing_period_start=now.isoformat(),
                billing_period_end=period_end,
                paid_at=now.isoformat() if charge == 0 else None,
                payment_method="free" if charge == 0 else None,
                transaction_id="upgrade-free" if charge == 0 else None,
                plan_snapshot={
                    "from_plan_id": str(current_plan.id) if current_plan else None,
                    "from_plan_name": current_plan.name if current_plan else None,
                    "to_plan_id": str(new_plan.id),
                    "to_plan_name": new_plan.name,
                    "current_monthly": current_price,
                    "new_monthly": new_price,
                    "billing_cycle": billing_cycle,
                    "credit": credit,
                    "charge": charge,
                },
                subtotal=charge,
                overage_total=0,
                discount_amount=round(credit, 2),
                tax_amount=0,
                total_due=charge,
                proration_factor=1,
                active_days=None,
                billing_days=None,
                finalized_at=now.isoformat(),
                notes="Client-admin plan upgrade/purchase",
            )
            db.add(billing)
            await db.flush()

    if charge == 0:
        if current_subscription:
            current_subscription.plan_id = new_plan.id
            current_subscription.started_at = now.isoformat()
            current_subscription.status = SubscriptionStatus.ACTIVE
            current_subscription.expires_at = _cycle_end(now, billing_cycle).isoformat()
            current_subscription.auto_renew = True
            current_subscription.billing_cycle = billing_cycle
        else:
            db.add(
                ClientSubscription(
                    client_id=client.id,
                    plan_id=new_plan.id,
                    status=SubscriptionStatus.ACTIVE,
                    started_at=now.isoformat(),
                    expires_at=_cycle_end(now, billing_cycle).isoformat(),
                    auto_renew=True,
                    billing_cycle=billing_cycle,
                )
            )
        
        await sync_client_account_state_from_subscription(client.id, db)

        # Send free upgrade confirmation email with platform branding (Platform → Client)
        logo_url = await get_platform_logo_url()
        platform_name = settings.APP_NAME or "StreamTVDepot"
        footer_text = await get_platform_footer_text(db)
        
        expires_at = (now + timedelta(days=30)).isoformat()
        body_text = (
            f"Hi {client.email},\\n\\n"
            "Your plan upgrade was successful!\\n"
            f"Invoice: {billing.invoice_number}\\n"
            f"Plan: {new_plan.name}\\n"
            f"Credit applied: {credit} {new_plan.currency}\\n\\n"
            f"Your plan is now active until {(now + timedelta(days=30)).strftime('%Y-%m-%d')}.\\n\\n"
            "Thank you for your business."
        )
        
        html_content = generate_professional_email_html(
            subject=f"Plan upgraded - {billing.invoice_number}",
            body_text=body_text,
            logo_url=logo_url,
            company_name=platform_name,
            footer_text=footer_text,
        )
        
        await send_system_email(
            db,
            event_key="client_plan_upgraded_free",
            to_email=client.email,
            to_name=client.email,
            subject=f"Plan upgraded - {billing.invoice_number}",
            body_text=body_text,
            body_html=html_content,
            metadata={
                "billing_id": str(billing.id),
                "plan_id": str(new_plan.id),
                "invoice_number": billing.invoice_number,
            },
        )
        
        await db.commit()
        return {
            "payment_required": False,
            "billing_id": str(billing.id),
            "prorated_credit": credit,
            "prorated_charge": charge,
            "currency": new_plan.currency,
            "message": "Plan activated successfully. No payment required.",
        }

    stripe_cfg, paypal_cfg, razorpay_cfg, cashfree_cfg = await _get_superadmin_gateway_cfg(db)
    stripe_enabled = _gateway_enabled(stripe_cfg)
    paypal_enabled = _gateway_enabled(paypal_cfg)
    razorpay_enabled = _gateway_enabled(razorpay_cfg)
    cashfree_enabled = _gateway_enabled(cashfree_cfg)

    if not any((stripe_enabled, paypal_enabled, razorpay_enabled, cashfree_enabled)):
        raise HTTPException(status_code=400, detail="No payment gateway is configured")

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
        raise HTTPException(status_code=400, detail="Stripe is not enabled")
    if gateway == "paypal" and not paypal_enabled:
        raise HTTPException(status_code=400, detail="PayPal is not enabled")
    if gateway == "razorpay" and not razorpay_enabled:
        raise HTTPException(status_code=400, detail="Razorpay is not enabled")
    if gateway == "cashfree" and not cashfree_enabled:
        raise HTTPException(status_code=400, detail="Cashfree is not enabled")

    billing.payment_method = gateway

    if gateway == "stripe":
        secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
        if not secret_key_encrypted:
            raise HTTPException(status_code=400, detail="Stripe secret key is not configured")

        stripe.api_key = decrypt_secret(secret_key_encrypted)

        success_url = (
            f"{settings.FRONTEND_PUBLIC_URL}/admin/billing-licensing"
            f"?upgrade_success=1&gateway=stripe&billing_id={billing.id}&stripe_session_id={{CHECKOUT_SESSION_ID}}"
        )
        cancel_url = f"{settings.FRONTEND_PUBLIC_URL}/admin/billing-licensing?upgrade_cancelled=1"

        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="payment",
            success_url=success_url,
            cancel_url=cancel_url,
            # Use existing Stripe customer to link saved payment methods
            **(dict(customer=client.stripe_customer_id) if client.stripe_customer_id else dict(customer_email=client.email)),
            payment_intent_data={"setup_future_usage": "off_session"},
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": str(new_plan.currency or "USD").lower(),
                        "unit_amount": max(1, _expected_minor_units(charge)),
                        "product_data": {
                            "name": f"{'Upgrade' if current_plan else 'Purchase'} {new_plan.name}",
                            "description": (
                                f"Prorated upgrade from {current_plan.name}"
                                if current_plan else
                                f"New subscription purchase for {new_plan.name}"
                            ),
                        },
                    },
                }
            ],
            metadata={
                "billing_id": str(billing.id),
                "client_id": str(client.id),
                "new_plan_id": str(new_plan.id),
            },
        )

        billing.transaction_id = session.id
        await db.commit()
        return {
            "payment_required": True,
            "billing_id": str(billing.id),
            "gateway": "stripe",
            "prorated_credit": credit,
            "prorated_charge": charge,
            "currency": new_plan.currency,
            "stripe_checkout_session_id": session.id,
            "redirect_url": session.url,
        }

    if gateway == "razorpay":
        if str(new_plan.currency or "").upper() != "INR":
            raise HTTPException(
                status_code=400,
                detail="Razorpay payments require a plan priced in INR",
            )

        import base64

        key_id = razorpay_cfg.get("key_id")
        key_secret_encrypted = razorpay_cfg.get("key_secret_encrypted")
        if not key_id or not key_secret_encrypted:
            raise HTTPException(status_code=400, detail="Razorpay credentials are not configured")

        key_secret = decrypt_secret(key_secret_encrypted)
        auth = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
        async with httpx.AsyncClient() as http:
            response = await http.post(
                "https://api.razorpay.com/v1/orders",
                headers={"Authorization": f"Basic {auth}"},
                json={
                    "amount": max(1, _expected_minor_units(charge)),
                    "currency": str(new_plan.currency or "USD").upper(),
                    "receipt": str(billing.id),
                    "notes": {"billing_id": str(billing.id), "client_id": str(client.id)},
                },
                timeout=20,
            )
        if response.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail="Razorpay order creation failed")
        order = response.json()
        billing.transaction_id = order.get("id")
        await db.commit()
        return {
            "payment_required": True,
            "billing_id": str(billing.id),
            "gateway": "razorpay",
            "prorated_credit": credit,
            "prorated_charge": charge,
            "currency": new_plan.currency,
            "razorpay_order_id": order.get("id"),
            "razorpay_key_id": key_id,
            "redirect_url": None,
        }

    if gateway == "cashfree":
        if str(new_plan.currency or "").upper() != "INR":
            raise HTTPException(
                status_code=400,
                detail="Cashfree payments require a plan priced in INR",
            )

        app_id = cashfree_cfg.get("app_id")
        app_secret_encrypted = cashfree_cfg.get("app_secret_encrypted")
        if not app_id or not app_secret_encrypted:
            raise HTTPException(status_code=400, detail="Cashfree credentials are not configured")

        app_secret = decrypt_secret(app_secret_encrypted)
        return_url = (
            f"{settings.FRONTEND_PUBLIC_URL}/admin/billing-licensing"
            f"?upgrade_success=1&gateway=cashfree&billing_id={billing.id}"
        )
        async with httpx.AsyncClient() as http:
            response = await http.post(
                "https://api.cashfree.com/pg/orders" if cashfree_cfg.get("mode", "test") == "live" else "https://sandbox.cashfree.com/pg/orders",
                headers={"x-client-id": app_id, "x-client-secret": app_secret, "x-api-version": "2023-08-01", "Content-Type": "application/json"},
                json={
                    "order_id": str(billing.id),
                    "order_amount": round(float(charge), 2),
                    "order_currency": str(new_plan.currency or "USD").upper(),
                    "customer_details": {"customer_id": str(client.id), "customer_email": client.email},
                    "order_meta": {"return_url": return_url},
                    "order_note": f"{'Upgrade' if current_plan else 'Purchase'} {new_plan.name}",
                },
                timeout=20,
            )
        if response.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail="Cashfree order creation failed")
        order = response.json()
        billing.transaction_id = order.get("order_id", str(billing.id))
        await db.commit()
        return {
            "payment_required": True,
            "billing_id": str(billing.id),
            "gateway": "cashfree",
            "prorated_credit": credit,
            "prorated_charge": charge,
            "currency": new_plan.currency,
            "cashfree_order_id": order.get("order_id"),
            "cashfree_payment_session_id": order.get("payment_session_id"),
            "cashfree_mode": cashfree_cfg.get("mode", "test"),
            "redirect_url": None,
        }

    pp_client_id = paypal_cfg.get("client_id")
    pp_secret_encrypted = paypal_cfg.get("client_secret_encrypted")
    if not pp_client_id or not pp_secret_encrypted:
        raise HTTPException(status_code=400, detail="PayPal credentials are not configured")

    pp_secret = decrypt_secret(pp_secret_encrypted)
    sandbox = paypal_cfg.get("mode", "sandbox") == "sandbox"
    base_url = "https://api-m.sandbox.paypal.com" if sandbox else "https://api-m.paypal.com"
    access_token = await _paypal_access_token(pp_client_id, pp_secret, sandbox)

    return_url = (
        f"{settings.FRONTEND_PUBLIC_URL}/admin/billing-licensing"
        f"?upgrade_success=1&gateway=paypal&billing_id={billing.id}"
    )
    cancel_url = f"{settings.FRONTEND_PUBLIC_URL}/admin/billing-licensing?upgrade_cancelled=1"

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
                        "reference_id": str(billing.id),
                        "custom_id": str(billing.id),
                        "amount": {
                            "currency_code": new_plan.currency.upper(),
                            "value": f"{charge:.2f}",
                        },
                        "description": f"{'Upgrade' if current_plan else 'Purchase'} {new_plan.name}",
                    }
                ],
                "payment_source": {
                    "paypal": {
                        "experience_context": {
                            "return_url": return_url,
                            "cancel_url": cancel_url,
                            "shipping_preference": "NO_SHIPPING",
                        },
                        # Request vault token on approval for future off-session charges
                        "attributes": {
                            "vault": {
                                "store_in_vault": "ON_SUCCESS",
                                "usage_type": "MERCHANT",
                                "customer_type": "CONSUMER",
                            }
                        },
                    }
                },
            },
            timeout=20,
        )
        resp.raise_for_status()
        order = resp.json()

    approval_url = next((link.get("href") for link in order.get("links", []) if link.get("rel") == "approve"), None)
    billing.transaction_id = order.get("id")
    await db.commit()

    return {
        "payment_required": True,
        "billing_id": str(billing.id),
        "gateway": "paypal",
        "prorated_credit": credit,
        "prorated_charge": charge,
        "currency": new_plan.currency,
        "paypal_order_id": order.get("id"),
        "redirect_url": approval_url,
    }


@router.post("/upgrade/confirm")
async def confirm_client_plan_upgrade(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    billing_id_raw = payload.get("billing_id")
    if not billing_id_raw:
        raise HTTPException(status_code=400, detail="billing_id is required")

    try:
        billing_id = uuid.UUID(str(billing_id_raw))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="billing_id is invalid")

    billing_result = await db.execute(
        select(SaasBilling).where(
            SaasBilling.id == billing_id,
            SaasBilling.client_id == admin._client_id,
        )
    )
    billing = billing_result.scalar_one_or_none()
    if not billing:
        raise HTTPException(status_code=404, detail="Billing record not found")

    if billing.status == BillingStatus.PAID:
        return {"success": True, "billing_id": str(billing.id), "message": "Upgrade already confirmed."}

    if not billing.plan_id:
        raise HTTPException(status_code=400, detail="Billing record is missing target plan")

    client_result = await db.execute(
        select(Client)
        .where(Client.id == admin._client_id)
        .options(selectinload(Client.subscription))
    )
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    plan_result = await db.execute(select(SaasSubscriptionPlan).where(SaasSubscriptionPlan.id == billing.plan_id))
    target_plan = plan_result.scalar_one_or_none()
    if not target_plan:
        raise HTTPException(status_code=404, detail="Target plan not found")

    amount_expected = _as_float(billing.amount)
    currency_expected = str(billing.currency or "USD").upper()

    gateway = str(payload.get("gateway") or billing.payment_method or "").lower()
    now = datetime.now(timezone.utc)
    transaction_id = None

    if gateway == "stripe":
        stripe_session_id = payload.get("stripe_session_id") or billing.transaction_id
        if not stripe_session_id:
            raise HTTPException(status_code=400, detail="stripe_session_id is required")

        stripe_cfg, _, _, _ = await _get_superadmin_gateway_cfg(db)
        secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
        if not secret_key_encrypted:
            raise HTTPException(status_code=400, detail="Stripe is not configured")

        stripe.api_key = decrypt_secret(secret_key_encrypted)
        session = await asyncio.to_thread(
            stripe.checkout.Session.retrieve,
            stripe_session_id,
            expand=["payment_intent"],
        )

        session_metadata = session.get("metadata") or {}
        if str(session_metadata.get("billing_id", "")) != str(billing.id):
            raise HTTPException(status_code=400, detail="Stripe session does not match this billing record")
        if session.get("payment_status") != "paid":
            raise HTTPException(status_code=400, detail="Stripe payment is not completed")

        amount_total = int(session.get("amount_total") or 0)
        if amount_total != _expected_minor_units(amount_expected):
            raise HTTPException(status_code=400, detail="Stripe paid amount does not match expected amount")
        currency = str(session.get("currency") or "").upper()
        if currency != currency_expected:
            raise HTTPException(status_code=400, detail="Stripe paid currency does not match expected currency")

        payment_intent = session.get("payment_intent")
        if isinstance(payment_intent, dict):
            transaction_id = payment_intent.get("id")
        else:
            transaction_id = str(payment_intent or stripe_session_id)

        # Persist Stripe Customer ID for future off-session auto-renewals
        stripe_customer = session.get("customer")
        if stripe_customer and not client.stripe_customer_id:
            client.stripe_customer_id = str(stripe_customer)

    elif gateway == "paypal":
        paypal_order_id = payload.get("paypal_order_id") or billing.transaction_id
        paypal_payer_id = payload.get("paypal_payer_id")
        if not paypal_order_id or not paypal_payer_id:
            raise HTTPException(status_code=400, detail="paypal_order_id and paypal_payer_id are required")

        _, paypal_cfg, _, _ = await _get_superadmin_gateway_cfg(db)
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
                f"{base_url}/v2/checkout/orders/{paypal_order_id}/capture",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                timeout=20,
            )
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=400, detail="PayPal capture failed")
            capture_data = resp.json()

        capture_obj = (
            capture_data.get("purchase_units", [{}])[0]
            .get("payments", {})
            .get("captures", [{}])[0]
        )
        amount_obj = capture_obj.get("amount", {}) if isinstance(capture_obj, dict) else {}
        paid_currency = str(amount_obj.get("currency_code", "")).upper()
        try:
            paid_amount = float(amount_obj.get("value"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid PayPal capture amount")

        if paid_currency != currency_expected:
            raise HTTPException(status_code=400, detail="PayPal currency does not match expected currency")
        if round(paid_amount, 2) != round(amount_expected, 2):
            raise HTTPException(status_code=400, detail="PayPal paid amount does not match expected amount")

        transaction_id = capture_obj.get("id", paypal_order_id)

        # Extract and persist vault token for future off-session renewals
        vault_info = (
            capture_data.get("payment_source", {})
            .get("paypal", {})
            .get("attributes", {})
            .get("vault", {})
        )
        paypal_vault_id = vault_info.get("id")
        if paypal_vault_id and not client.paypal_vault_id:
            client.paypal_vault_id = str(paypal_vault_id)

    else:
        raise HTTPException(status_code=400, detail="Unsupported gateway")

    current_expires = client.subscription.expires_at if client.subscription else None
    current_expires_dt = _parse_iso(current_expires)
    billing_cycle = _billing_cycle((billing.plan_snapshot or {}).get("billing_cycle"))
    if not current_expires_dt or current_expires_dt <= now:
        current_expires_dt = _cycle_end(now, billing_cycle)

    if client.subscription:
        client.subscription.plan_id = target_plan.id
        client.subscription.status = SubscriptionStatus.ACTIVE
        client.subscription.started_at = now.isoformat()
        client.subscription.expires_at = current_expires_dt.isoformat()
        client.subscription.auto_renew = True
        client.subscription.billing_cycle = billing_cycle
    else:
        db.add(
            ClientSubscription(
                client_id=client.id,
                plan_id=target_plan.id,
                status=SubscriptionStatus.ACTIVE,
                started_at=now.isoformat(),
                expires_at=current_expires_dt.isoformat(),
                auto_renew=True,
                billing_cycle=billing_cycle,
            )
        )

    await sync_client_account_state_from_subscription(client.id, db)

    billing.status = BillingStatus.PAID
    billing.paid_at = now.isoformat()
    billing.payment_method = gateway
    billing.transaction_id = transaction_id
    billing.finalized_at = now.isoformat()

    # Send payment confirmation email with platform branding (Platform → Client)
    logo_url = await get_platform_logo_url()
    platform_name = settings.APP_NAME or "StreamTVDepot"
    footer_text = await get_platform_footer_text(db)
    
    body_text = (
        f"Hi {client.email},\\n\\n"
        "Your payment was received successfully.\\n"
        f"Invoice: {billing.invoice_number}\\n"
        f"Plan: {target_plan.name}\\n"
        f"Amount: {_as_float(billing.amount)} {billing.currency}\\n"
        f"Transaction ID: {transaction_id}\\n\\n"
        f"Your plan is now active until {current_expires_dt.strftime('%Y-%m-%d')}.\\n\\n"
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
        event_key="client_payment_success",
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

    return {
        "success": True,
        "billing_id": str(billing.id),
        "transaction_id": transaction_id,
        "message": f"Plan activated: {target_plan.name}.",
    }


@router.post("/downgrade/request")
async def request_plan_downgrade(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Schedule a plan downgrade for the next billing cycle renewal."""
    new_plan_id_raw = payload.get("new_plan_id")
    if not new_plan_id_raw:
        raise HTTPException(status_code=400, detail="new_plan_id is required")

    try:
        new_plan_id = uuid.UUID(str(new_plan_id_raw))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="new_plan_id is invalid")

    client_result = await db.execute(
        select(Client)
        .where(Client.id == admin._client_id)
        .options(selectinload(Client.subscription).selectinload(ClientSubscription.plan))
    )
    client = client_result.scalar_one_or_none()
    if not client or not client.subscription:
        raise HTTPException(status_code=404, detail="No active subscription found")

    if not _is_valid_active_subscription(client.subscription):
        raise HTTPException(status_code=400, detail="No valid active subscription to downgrade")

    new_plan_result = await db.execute(
        select(SaasSubscriptionPlan).where(
            SaasSubscriptionPlan.id == new_plan_id,
            SaasSubscriptionPlan.is_active.is_(True),
            SaasSubscriptionPlan.deleted_at.is_(None),
        )
    )
    new_plan = new_plan_result.scalar_one_or_none()
    if not new_plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    current_price = _as_float(client.subscription.plan.price_monthly) if client.subscription.plan else 0.0
    if _as_float(new_plan.price_monthly) >= current_price:
        raise HTTPException(status_code=400, detail="Target plan is not a downgrade")

    now = datetime.now(timezone.utc)
    client.subscription.pending_downgrade_plan_id = new_plan.id
    client.subscription.pending_downgrade_requested_at = now.isoformat()
    await db.commit()

    return {
        "success": True,
        "message": (
            f"Downgrade to {new_plan.name} has been scheduled. "
            "It will take effect at the start of your next billing cycle."
        ),
        "effective_at": client.subscription.expires_at,
    }


@router.delete("/downgrade/request")
async def cancel_pending_downgrade(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Cancel a previously scheduled plan downgrade."""
    client_result = await db.execute(
        select(Client)
        .where(Client.id == admin._client_id)
        .options(selectinload(Client.subscription))
    )
    client = client_result.scalar_one_or_none()
    if not client or not client.subscription:
        raise HTTPException(status_code=404, detail="No subscription found")

    if client.subscription.pending_downgrade_plan_id is None:
        raise HTTPException(status_code=400, detail="No pending downgrade to cancel")

    client.subscription.pending_downgrade_plan_id = None
    client.subscription.pending_downgrade_requested_at = None
    await db.commit()

    return {"success": True, "message": "Pending downgrade cancelled. Your current plan will continue."}


async def _get_client_stripe_context(
    db: AsyncSession,
    admin,
) -> tuple[Client, dict, str]:
    client_result = await db.execute(select(Client).where(Client.id == admin._client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    stripe_cfg, _, _, _ = await _get_superadmin_gateway_cfg(db)
    secret_key_encrypted = stripe_cfg.get("secret_key_encrypted")
    if not stripe_cfg.get("enabled") or not secret_key_encrypted:
        raise HTTPException(status_code=400, detail="Stripe is not configured")

    stripe.api_key = decrypt_secret(secret_key_encrypted)
    return client, stripe_cfg, stripe.api_key


async def _ensure_client_stripe_customer(db: AsyncSession, client: Client) -> str:
    if client.stripe_customer_id:
        return client.stripe_customer_id

    customer = await asyncio.to_thread(
        stripe.Customer.create,
        email=client.email,
        name=client.name,
        metadata={"client_id": str(client.id)},
    )
    client.stripe_customer_id = customer.id
    await db.commit()
    return customer.id


@router.get("/payment-methods")
async def list_billing_payment_methods(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client, _, _ = await _get_client_stripe_context(db, admin)
    if not client.stripe_customer_id:
        return {"payment_methods": []}

    customer = await asyncio.to_thread(stripe.Customer.retrieve, client.stripe_customer_id)
    methods = await asyncio.to_thread(
        stripe.PaymentMethod.list,
        customer=client.stripe_customer_id,
        type="card",
    )
    default_id = (customer.get("invoice_settings") or {}).get("default_payment_method")
    return {
        "payment_methods": [
            {
                "id": method.id,
                "brand": method.card.brand,
                "last4": method.card.last4,
                "exp_month": method.card.exp_month,
                "exp_year": method.card.exp_year,
                "is_default": method.id == default_id,
                "provider": "stripe",
            }
            for method in methods.data
        ]
    }


@router.post("/payment-methods/setup")
async def create_billing_payment_method_setup(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client, _, _ = await _get_client_stripe_context(db, admin)
    customer_id = await _ensure_client_stripe_customer(db, client)
    setup_intent = await asyncio.to_thread(
        stripe.SetupIntent.create,
        customer=customer_id,
        payment_method_types=["card"],
        usage="off_session",
        metadata={"client_id": str(client.id)},
    )
    stripe_cfg, _, _, _ = await _get_superadmin_gateway_cfg(db)
    return {
        "stripe_client_secret": setup_intent.client_secret,
        "stripe_publishable_key": stripe_cfg.get("publishable_key"),
    }


@router.delete("/payment-methods/{payment_method_id}")
async def delete_billing_payment_method(
    payment_method_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client, _, _ = await _get_client_stripe_context(db, admin)
    if not client.stripe_customer_id:
        raise HTTPException(status_code=404, detail="No saved payment methods found")

    method = await asyncio.to_thread(stripe.PaymentMethod.retrieve, payment_method_id)
    if method.customer != client.stripe_customer_id or method.type != "card":
        raise HTTPException(status_code=404, detail="Payment method not found")

    await asyncio.to_thread(stripe.PaymentMethod.detach, payment_method_id)
    return await list_billing_payment_methods(db=db, admin=admin)


@router.put("/auto-renew")
async def toggle_auto_renew(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Enable or disable auto-renewal for the current subscription."""
    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        raise HTTPException(status_code=400, detail="'enabled' must be a boolean")

    client_result = await db.execute(
        select(Client)
        .where(Client.id == admin._client_id)
        .options(selectinload(Client.subscription))
    )
    client = client_result.scalar_one_or_none()
    if not client or not client.subscription:
        raise HTTPException(status_code=404, detail="No active subscription found")

    client.subscription.auto_renew = enabled
    await db.commit()

    state = "enabled" if enabled else "disabled"
    return {
        "success": True,
        "auto_renew": enabled,
        "message": f"Auto-renewal {state}. {'Your plan will renew automatically at the end of each billing cycle.' if enabled else 'Your plan will not renew automatically. You will have a 7-day grace period after expiry to renew manually.'}",
    }
