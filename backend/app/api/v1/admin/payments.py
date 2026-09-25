from datetime import datetime, timedelta, timezone

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.invoice_generator import generate_end_user_invoice_pdf
from app.models.client.payment import Invoice, Payment
from app.models.client.user import EndUser
from app.models.superadmin.client import Client
from app.schemas.client.payment import InvoiceOut, PaymentAdminOut, PaymentOut

router = APIRouter()

_STALE_PENDING_HOURS = 24


def _format_end_user_billing_address(user: EndUser | None) -> str | None:
    if not user:
        return None
    lines = [user.billing_line1, user.billing_line2]
    locality = ", ".join(part for part in [user.billing_city, user.billing_state] if part)
    if user.billing_postal_code:
        locality = f"{locality} {user.billing_postal_code}".strip()
    lines.extend([locality or None, user.billing_country])
    return "\n".join(line for line in lines if line) or None


@router.get("", response_model=list[PaymentAdminOut])
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_STALE_PENDING_HOURS)

    # Remove stale pending transactions older than 24 hours before listing.
    await db.execute(
        text(
            "DELETE FROM payments"
            " WHERE client_id = CAST(:cid AS uuid)"
            "   AND status    = 'PENDING'"
            "   AND created_at < :cutoff"
        ),
        {"cid": str(admin._client_id), "cutoff": cutoff},
    )

    result = await db.execute(
        select(Payment, EndUser.full_name, EndUser.email)
        .join(EndUser, Payment.user_id == EndUser.id, isouter=True)
        .where(Payment.client_id == admin._client_id)
        .order_by(Payment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return [
        PaymentAdminOut(
            **PaymentOut.model_validate(payment).model_dump(),
            user_name=full_name,
            user_email=email,
        )
        for payment, full_name, email in result.all()
    ]


@router.get("/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Invoice, EndUser, Client)
        .join(EndUser, Invoice.user_id == EndUser.id, isouter=True)
        .join(Client, Invoice.client_id == Client.id)
        .where(Invoice.client_id == admin._client_id)
        .order_by(Invoice.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return [
        InvoiceOut.model_validate(invoice).model_copy(
            update={
                "user_name": user.full_name if user else None,
                "user_email": user.email if user else None,
                "user_address": _format_end_user_billing_address(user),
                "client_name": client.name,
                "client_address": client.address,
                "client_logo_url": client.logo_url,
            }
        )
        for invoice, user, client in result.all()
    ]


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(Invoice, EndUser, Client)
        .join(EndUser, Invoice.user_id == EndUser.id, isouter=True)
        .join(Client, Invoice.client_id == Client.id)
        .where(Invoice.id == invoice_id, Invoice.client_id == admin._client_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice, user, client = row
    pdf = generate_end_user_invoice_pdf(
        invoice_number=invoice.invoice_number,
        issued_at=invoice.issued_at,
        amount=float(invoice.amount),
        tax_amount=float(invoice.tax_amount or 0),
        currency=invoice.currency or "USD",
        client_name=client.name,
        client_address=client.address,
        client_email=client.email,
        user_name=user.full_name if user else "End User",
        user_email=user.email if user else None,
        user_address=_format_end_user_billing_address(user),
    )
    filename = f"invoice-{invoice.invoice_number}.pdf"
    return StreamingResponse(
        iter([pdf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
