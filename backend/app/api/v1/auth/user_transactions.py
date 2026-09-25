"""
End-user transactions API.

GET /auth/user/my-transactions → paginated list of the current user's payment history

Stale-pending policy:
  PENDING records older than _STALE_PENDING_MINUTES are soft-expired to ABANDONED on
  every fetch.  This keeps the audit trail intact while ensuring users never see ghost
  "Processing" entries from abandoned checkout sessions.
  15 minutes covers any realistic Stripe/PayPal synchronous confirmation round-trip,
  including 3DS bank-redirect flows.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.invoice_generator import generate_billing_receipt_pdf
from app.core.system_mail import get_client_logo_url
from app.core.database import get_db
from app.core.dependencies import get_current_end_user
from app.models.client.payment import Invoice, Payment, PaymentMethod, PaymentStatus
from app.models.client.subscription import ClientSubscriptionPlan
from app.models.superadmin.client import Client

router = APIRouter()

# Pending payments older than this are considered abandoned (not deleted — kept for audit).
_STALE_PENDING_MINUTES = 15


def _payment_method_label(payment_method: PaymentMethod) -> str:
    return payment_method.value.replace("_", " ").title()


def _is_scheduled_downgrade(payment: Payment) -> bool:
    """Scheduled downgrades are bookkeeping-only events, not real customer transactions."""
    if payment.gateway_transaction_id == "scheduled-downgrade":
        return True

    if float(payment.amount) != 0 or not payment.notes:
        return False

    try:
        notes = json.loads(payment.notes or "{}")
    except (TypeError, ValueError):
        return False

    return bool(notes.get("scheduled_downgrade_from_sub_id"))


# ── Schema ────────────────────────────────────────────────────────────────────

class UserTransactionOut(BaseModel):
    id: uuid.UUID
    amount: float
    currency: str
    status: PaymentStatus
    payment_method: PaymentMethod
    gateway_transaction_id: str | None
    reference_type: str | None   # "subscription" | "ppv" | "rental"
    reference_id: str | None
    invoice_number: str | None
    paid_at: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserTransactionReceiptOut(BaseModel):
    payment_id: uuid.UUID
    invoice_number: str
    amount: float
    currency: str
    status: str
    payment_method: str
    transaction_id: str | None
    reference_type: str | None
    plan_name: str | None
    plan_amount: float | None = None
    discount_amount: float | None = None
    tax_amount: float = 0
    paid_at: str | None
    created_at: datetime
    tenant_name: str
    tenant_logo_url: str | None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[UserTransactionOut])
async def list_my_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: PaymentStatus | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_end_user),
):
    """Return the authenticated end-user's own payment records, newest first."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=_STALE_PENDING_MINUTES)

    # Soft-expire stale PENDING records → ABANDONED (preserves audit trail).
    # Hard deletion is intentionally avoided: financial records must be retained.
    await db.execute(
        update(Payment)
        .where(
            Payment.client_id == user._client_id,
            Payment.user_id == user.id,
            Payment.status == PaymentStatus.PENDING,
            Payment.created_at < cutoff,
        )
        .values(status=PaymentStatus.ABANDONED)
    )

    filters = [
        Payment.client_id == user._client_id,
        Payment.user_id == user.id,
    ]
    if status is not None:
        filters.append(Payment.status == status)

    result = await db.execute(
        select(Payment)
        .where(*filters)
        .order_by(Payment.created_at.desc())
    )
    payments = [payment for payment in result.scalars().all() if not _is_scheduled_downgrade(payment)]
    start = (page - 1) * page_size
    payments = payments[start:start + page_size]
    if not payments:
        return []

    payment_ids = [p.id for p in payments]
    inv_result = await db.execute(
        select(Invoice).where(
            Invoice.client_id == user._client_id,
            Invoice.user_id == user.id,
            Invoice.payment_id.in_(payment_ids),
        )
    )
    invoice_map = {inv.payment_id: inv for inv in inv_result.scalars().all()}

    return [
        UserTransactionOut(
            id=payment.id,
            amount=float(payment.amount),
            currency=payment.currency,
            status=payment.status,
            payment_method=payment.payment_method,
            gateway_transaction_id=payment.gateway_transaction_id,
            reference_type=payment.reference_type,
            reference_id=payment.reference_id,
            invoice_number=(invoice_map.get(payment.id).invoice_number if invoice_map.get(payment.id) else None),
            paid_at=payment.paid_at,
            created_at=payment.created_at,
        )
        for payment in payments
    ]


@router.get("/{payment_id}/receipt.pdf")
async def get_transaction_receipt_pdf(
    payment_id: uuid.UUID,
    download: bool = Query(False, description="Set true to force attachment download"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_end_user),
):
    payment_result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.client_id == user._client_id,
            Payment.user_id == user.id,
        )
    )
    payment = payment_result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if payment.status != PaymentStatus.SUCCESS:
        raise HTTPException(
            status_code=400,
            detail="Receipt is available only for successful transactions",
        )

    invoice_result = await db.execute(
        select(Invoice).where(
            Invoice.client_id == user._client_id,
            Invoice.user_id == user.id,
            Invoice.payment_id == payment.id,
        )
    )
    invoice = invoice_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found for this transaction")

    plan_name: str | None = None
    if payment.reference_id:
        try:
            plan_id = uuid.UUID(str(payment.reference_id))
            plan_result = await db.execute(
                select(ClientSubscriptionPlan).where(
                    ClientSubscriptionPlan.client_id == user._client_id,
                    ClientSubscriptionPlan.id == plan_id,
                )
            )
            plan = plan_result.scalar_one_or_none()
            plan_name = plan.name if plan else None
        except (ValueError, TypeError):
            plan_name = None

    client_result = await db.execute(
        select(Client).where(Client.id == user._client_id)
    )
    client = client_result.scalar_one_or_none()
    cfg = dict(client.site_config) if client and client.site_config else {}
    tenant_name = cfg.get("site_title") or (client.slug if client else "SignalView")
    tenant_logo_url = await get_client_logo_url(db, user._client_id)

    receipt_status = "paid"
    pdf = generate_billing_receipt_pdf(
        invoice_number=invoice.invoice_number,
        created_at=payment.created_at.isoformat() if payment.created_at else None,
        paid_at=payment.paid_at,
        amount=float(invoice.amount),
        currency=invoice.currency,
        status=receipt_status,
        plan_name=plan_name,
        period_start=payment.paid_at,
        period_end=None,
        transaction_id=payment.gateway_transaction_id,
        payment_method=_payment_method_label(payment.payment_method),
        issuer_footer=tenant_name,
        logo_url=tenant_logo_url,
        tax_amount=float(invoice.tax_amount or 0),
        original_amount=float(invoice.original_amount) if invoice.original_amount is not None else None,
        discount_amount=float(invoice.discount_amount or 0),
    )

    disposition: Literal["inline", "attachment"] = "attachment" if download else "inline"
    filename = f"receipt-{invoice.invoice_number}.pdf"
    return StreamingResponse(
        iter([pdf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.get("/{payment_id}/receipt", response_model=UserTransactionReceiptOut)
async def get_transaction_receipt_details(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_end_user),
):
    payment_result = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.client_id == user._client_id,
            Payment.user_id == user.id,
        )
    )
    payment = payment_result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if payment.status != PaymentStatus.SUCCESS:
        raise HTTPException(
            status_code=400,
            detail="Receipt is available only for successful transactions",
        )

    invoice_result = await db.execute(
        select(Invoice).where(
            Invoice.client_id == user._client_id,
            Invoice.user_id == user.id,
            Invoice.payment_id == payment.id,
        )
    )
    invoice = invoice_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found for this transaction")

    plan_name: str | None = None
    if payment.reference_id:
        try:
            plan_id = uuid.UUID(str(payment.reference_id))
            plan_result = await db.execute(
                select(ClientSubscriptionPlan).where(
                    ClientSubscriptionPlan.client_id == user._client_id,
                    ClientSubscriptionPlan.id == plan_id,
                )
            )
            plan = plan_result.scalar_one_or_none()
            plan_name = plan.name if plan else None
        except (ValueError, TypeError):
            plan_name = None

    client_result = await db.execute(select(Client).where(Client.id == user._client_id))
    client = client_result.scalar_one_or_none()
    cfg = dict(client.site_config) if client and client.site_config else {}
    tenant_name = cfg.get("site_title") or (client.slug if client else "SignalView")
    tenant_logo_url = await get_client_logo_url(db, user._client_id)

    return UserTransactionReceiptOut(
        payment_id=payment.id,
        invoice_number=invoice.invoice_number,
        amount=float(invoice.amount),
        currency=invoice.currency,
        status=payment.status.value,
        payment_method=_payment_method_label(payment.payment_method),
        transaction_id=payment.gateway_transaction_id,
        reference_type=payment.reference_type,
        plan_name=plan_name,
        plan_amount=float(
            invoice.original_amount
            if invoice.original_amount is not None
            else invoice.amount
        ),
        discount_amount=float(invoice.discount_amount),
        tax_amount=float(invoice.tax_amount or 0),
        paid_at=payment.paid_at,
        created_at=payment.created_at,
        tenant_name=tenant_name,
        tenant_logo_url=tenant_logo_url,
    )
