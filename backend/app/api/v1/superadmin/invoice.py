"""
Invoice download endpoint
GET /superadmin/usage/{client_id}/invoice
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import FileResponse, StreamingResponse

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.core.invoice_generator import ExportFormat, generate_invoice_csv, generate_invoice_pdf
from app.models.superadmin.client import ClientSubscription
from app.models.superadmin.usage import ClientMonthlyUsage

router = APIRouter()


@router.get("/{client_id}/invoice")
async def download_invoice(
    client_id: uuid.UUID,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    format: str = Query("pdf", regex="^(pdf|csv)$"),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """Download invoice for a client's monthly usage."""

    # Get usage record
    usage = (
        await db.execute(
            select(ClientMonthlyUsage)
            .where(
                ClientMonthlyUsage.client_id == client_id,
                ClientMonthlyUsage.billing_year == year,
                ClientMonthlyUsage.billing_month == month,
            )
            .options(selectinload(ClientMonthlyUsage.client))
        )
    ).scalar_one_or_none()

    if not usage:
        raise HTTPException(status_code=404, detail="Usage record not found")

    # Get client subscription for plan info
    sub = (
        await db.execute(
            select(ClientSubscription)
            .where(ClientSubscription.client_id == client_id)
            .options(selectinload(ClientSubscription.plan))
        )
    ).scalar_one_or_none()

    plan = sub.plan if sub else None
    plan_name = plan.name if plan else "Unknown Plan"

    # Prepare overage dict
    overages = {
        "Bandwidth (GB)": float(usage.overage_bandwidth),
        "Storage (GB)": float(usage.overage_storage),
        "Encoding (min)": float(usage.overage_encoding),
        "API Calls": float(usage.overage_api),
    }

    # Generate invoice
    if format == "pdf":
        pdf_buffer = generate_invoice_pdf(
            client_name=usage.client.name,
            client_slug=usage.client.slug,
            plan_name=plan_name,
            billing_year=year,
            billing_month=month,
            base_fee=float(usage.base_fee),
            overages=overages,
            total_invoice=float(usage.total_invoice),
            currency=usage.currency,
        )
        return StreamingResponse(
            iter([pdf_buffer.getvalue()]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=invoice_{year}-{month:02d}_{usage.client.slug}.pdf"},
        )
    else:  # csv
        csv_buffer = generate_invoice_csv(
            client_name=usage.client.name,
            client_slug=usage.client.slug,
            plan_name=plan_name,
            billing_year=year,
            billing_month=month,
            base_fee=float(usage.base_fee),
            overages=overages,
            total_invoice=float(usage.total_invoice),
            currency=usage.currency,
        )
        return StreamingResponse(
            iter([csv_buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=invoice_{year}-{month:02d}_{usage.client.slug}.csv"},
        )
