import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.tax import ClientTax
from app.schemas.client.tax import ClientTaxCreate, ClientTaxOut, ClientTaxUpdate

router = APIRouter()


async def _load_tax(
    tax_id: uuid.UUID, db: AsyncSession, client_id: uuid.UUID
) -> ClientTax:
    result = await db.execute(
        select(ClientTax).where(ClientTax.id == tax_id, ClientTax.client_id == client_id)
    )
    tax = result.scalar_one_or_none()
    if not tax:
        raise HTTPException(status_code=404, detail="Tax not found")
    return tax


@router.get("", response_model=list[ClientTaxOut])
async def list_taxes(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(ClientTax)
        .where(ClientTax.client_id == admin._client_id)
        .order_by(ClientTax.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ClientTaxOut, status_code=status.HTTP_201_CREATED)
async def create_tax(
    payload: ClientTaxCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    values = payload.model_dump()
    if values["tax_type"] == "flat":
        values["percentage"] = 0
    else:
        values["flat_amount"] = None
    tax = ClientTax(client_id=admin._client_id, **values)
    db.add(tax)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="A tax with this name already exists")
    await db.refresh(tax)
    return tax


@router.patch("/{tax_id}", response_model=ClientTaxOut)
async def update_tax(
    tax_id: uuid.UUID,
    payload: ClientTaxUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    tax = await _load_tax(tax_id, db, admin._client_id)
    values = payload.model_dump(exclude_none=True)
    tax_type = values.get("tax_type", tax.tax_type)
    if tax_type == "flat" and values.get("tax_type") == "flat" and "flat_amount" not in values:
        raise HTTPException(status_code=400, detail="Flat amount is required for a flat tax")
    if tax_type == "percentage" and values.get("tax_type") == "percentage" and "percentage" not in values:
        raise HTTPException(status_code=400, detail="Percentage is required for a percentage tax")
    if tax_type == "flat":
        values["percentage"] = 0
    elif "tax_type" in values:
        values["flat_amount"] = None
    for field, value in values.items():
        setattr(tax, field, value)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="A tax with this name already exists")
    await db.refresh(tax)
    return tax


@router.delete("/{tax_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tax(
    tax_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    tax = await _load_tax(tax_id, db, admin._client_id)
    await db.delete(tax)