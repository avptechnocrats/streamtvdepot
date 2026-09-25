"""
Admin coupon management API.

GET    /admin/coupons              - List all coupons
POST   /admin/coupons              - Create new coupon
GET    /admin/coupons/{id}         - Get coupon details
PATCH  /admin/coupons/{id}         - Update coupon
DELETE /admin/coupons/{id}         - Delete coupon
GET    /admin/coupons/{id}/usages  - Get coupon usage history
GET    /admin/coupons/stats        - Get coupon statistics
POST   /admin/coupons/validate     - Validate coupon (for preview)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.coupon import Coupon, CouponUsage
from app.models.client.subscription import ClientSubscriptionPlan
from app.schemas.client.coupon import (
    CouponCreate,
    CouponOut,
    CouponStatsOut,
    CouponUpdate,
    CouponUsageOut,
    CouponValidateRequest,
    CouponValidateResponse,
)

router = APIRouter()


# ─── Helper functions ─────────────────────────────────────────────────────────

async def _validate_coupon_code_unique(
    db: AsyncSession,
    client_id: uuid.UUID,
    code: str,
    exclude_id: uuid.UUID | None = None,
) -> None:
    """Check if coupon code already exists for this client."""
    stmt = select(Coupon).where(
        Coupon.client_id == client_id,
        Coupon.code == code.strip().upper(),
    )
    if exclude_id:
        stmt = stmt.where(Coupon.id != exclude_id)
    
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Coupon code '{code}' already exists")


def _calculate_discount(
    coupon: Coupon,
    amount: float,
) -> tuple[float, float]:
    """
    Calculate discount amount and final amount.
    
    Returns:
        (discount_amount, final_amount)
    """
    if coupon.discount_type == "percentage":
        discount = amount * (coupon.discount_value / 100)
        # Apply max discount cap if set
        if coupon.max_discount_amount and discount > coupon.max_discount_amount:
            discount = coupon.max_discount_amount
    else:  # fixed_amount
        discount = min(coupon.discount_value, amount)  # Can't discount more than amount
    
    final = max(0, amount - discount)
    return float(discount), float(final)


async def _validate_coupon_for_user(
    db: AsyncSession,
    coupon: Coupon,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    amount: float,
) -> tuple[bool, str | None]:
    """
    Validate if a coupon can be used by a user for a specific plan.
    
    Returns:
        (is_valid, error_message)
    """
    now = datetime.now(timezone.utc)
    
    # Check if coupon is active
    if not coupon.is_active:
        return False, "Coupon is not active"
    
    # Check validity period
    if coupon.valid_from:
        try:
            valid_from = datetime.fromisoformat(coupon.valid_from)
            if now < valid_from:
                return False, "Coupon is not yet valid"
        except ValueError:
            pass
    
    if coupon.valid_until:
        try:
            valid_until = datetime.fromisoformat(coupon.valid_until)
            if now > valid_until:
                return False, "Coupon has expired"
        except ValueError:
            pass
    
    # Check minimum amount
    if coupon.min_amount and amount < coupon.min_amount:
        return False, f"Minimum purchase amount is {coupon.min_amount}"
    
    # Check total usage limit
    if coupon.max_uses and coupon.current_uses >= coupon.max_uses:
        return False, "Coupon usage limit reached"
    
    # Check per-user usage limit
    if coupon.max_uses_per_user:
        user_usage_count = await db.scalar(
            select(func.count(CouponUsage.id)).where(
                CouponUsage.coupon_id == coupon.id,
                CouponUsage.user_id == user_id,
            )
        )
        if user_usage_count >= coupon.max_uses_per_user:
            return False, "You have reached the usage limit for this coupon"
    
    # Check plan restrictions
    if coupon.applies_to_plan_ids:
        if str(plan_id) not in [str(p) for p in coupon.applies_to_plan_ids]:
            return False, "Coupon is not applicable to this plan"
    
    return True, None


# ─── API Endpoints ────────────────────────────────────────────────────────────

@router.get("/stats", response_model=CouponStatsOut)
async def get_coupon_stats(
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get overall coupon statistics."""
    client_id = admin._client_id
    
    # Total coupons
    total_coupons = await db.scalar(
        select(func.count(Coupon.id)).where(Coupon.client_id == client_id)
    )
    
    # Active coupons
    active_coupons = await db.scalar(
        select(func.count(Coupon.id)).where(
            Coupon.client_id == client_id,
            Coupon.is_active == True,
        )
    )
    
    # Total usage
    total_usage = await db.scalar(
        select(func.count(CouponUsage.id)).where(CouponUsage.client_id == client_id)
    )
    
    # Total discount given
    total_discount = await db.scalar(
        select(func.sum(CouponUsage.discount_amount)).where(
            CouponUsage.client_id == client_id
        )
    )
    
    return CouponStatsOut(
        total_coupons=total_coupons or 0,
        active_coupons=active_coupons or 0,
        total_usage=total_usage or 0,
        total_discount_given=float(total_discount or 0),
    )


@router.get("", response_model=list[CouponOut])
async def list_coupons(
    is_active: bool | None = Query(None, description="Filter by active status"),
    search: str | None = Query(None, description="Search by code or description"),
    discount_type: str | None = Query(None, description="Filter by discount type: percentage or fixed_amount"),
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all coupons for the current client."""
    client_id = admin._client_id

    stmt = select(Coupon).where(Coupon.client_id == client_id)

    if is_active is not None:
        stmt = stmt.where(Coupon.is_active == is_active)

    if discount_type is not None:
        stmt = stmt.where(Coupon.discount_type == discount_type)

    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            Coupon.code.ilike(search_pattern) | Coupon.description.ilike(search_pattern)
        )

    stmt = stmt.order_by(Coupon.created_at.desc())

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=CouponOut)
async def create_coupon(
    payload: CouponCreate,
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new coupon."""
    client_id = admin._client_id
    
    # Validate unique code
    await _validate_coupon_code_unique(db, client_id, payload.code)
    
    # Validate plan IDs if specified
    if payload.applies_to_plan_ids:
        plan_result = await db.execute(
            select(ClientSubscriptionPlan.id).where(
                ClientSubscriptionPlan.client_id == client_id,
                ClientSubscriptionPlan.id.in_(payload.applies_to_plan_ids),
            )
        )
        valid_plan_ids = [row[0] for row in plan_result.all()]
        if len(valid_plan_ids) != len(payload.applies_to_plan_ids):
            raise HTTPException(status_code=400, detail="One or more plan IDs are invalid")
    
    coupon = Coupon(
        client_id=client_id,
        code=payload.code.strip().upper(),
        description=payload.description,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        min_amount=payload.min_amount,
        max_discount_amount=payload.max_discount_amount,
        max_uses=payload.max_uses,
        max_uses_per_user=payload.max_uses_per_user,
        currency=payload.currency,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        applies_to_plan_ids=[str(plan_id) for plan_id in payload.applies_to_plan_ids]
        if payload.applies_to_plan_ids else None,
        is_active=payload.is_active,
        current_uses=0,
    )
    
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    
    return coupon


@router.get("/{coupon_id}", response_model=CouponOut)
async def get_coupon(
    coupon_id: uuid.UUID,
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific coupon."""
    result = await db.execute(
        select(Coupon).where(
            Coupon.id == coupon_id,
            Coupon.client_id == admin._client_id,
        )
    )
    coupon = result.scalar_one_or_none()
    
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    return coupon


@router.patch("/{coupon_id}", response_model=CouponOut)
async def update_coupon(
    coupon_id: uuid.UUID,
    payload: CouponUpdate,
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a coupon."""
    result = await db.execute(
        select(Coupon).where(
            Coupon.id == coupon_id,
            Coupon.client_id == admin._client_id,
        )
    )
    coupon = result.scalar_one_or_none()
    
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "applies_to_plan_ids" in update_data and update_data["applies_to_plan_ids"]:
        plan_ids = update_data["applies_to_plan_ids"]
        plan_result = await db.execute(
            select(ClientSubscriptionPlan.id).where(
                ClientSubscriptionPlan.client_id == admin._client_id,
                ClientSubscriptionPlan.id.in_(plan_ids),
            )
        )
        if len(plan_result.all()) != len(plan_ids):
            raise HTTPException(status_code=400, detail="One or more plan IDs are invalid")
        update_data["applies_to_plan_ids"] = [str(plan_id) for plan_id in plan_ids]
    # Update fields
    for field, value in update_data.items():
        setattr(coupon, field, value)
    
    await db.commit()
    await db.refresh(coupon)
    
    return coupon


@router.delete("/{coupon_id}")
async def delete_coupon(
    coupon_id: uuid.UUID,
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a coupon."""
    result = await db.execute(
        select(Coupon).where(
            Coupon.id == coupon_id,
            Coupon.client_id == admin._client_id,
        )
    )
    coupon = result.scalar_one_or_none()
    
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    await db.delete(coupon)
    await db.commit()
    
    return {"message": "Coupon deleted successfully"}


@router.get("/{coupon_id}/usages", response_model=list[CouponUsageOut])
async def get_coupon_usages(
    coupon_id: uuid.UUID,
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get usage history for a specific coupon."""
    # Verify coupon belongs to this client
    coupon_result = await db.execute(
        select(Coupon).where(
            Coupon.id == coupon_id,
            Coupon.client_id == admin._client_id,
        )
    )
    if not coupon_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Coupon not found")
    
    result = await db.execute(
        select(CouponUsage)
        .where(CouponUsage.coupon_id == coupon_id)
        .order_by(CouponUsage.used_at.desc())
    )
    
    return result.scalars().all()


@router.post("/validate", response_model=CouponValidateResponse)
async def validate_coupon(
    payload: CouponValidateRequest,
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate a coupon code for a specific plan and amount.
    This is for admin preview purposes.
    """
    client_id = admin._client_id
    
    # Find coupon
    result = await db.execute(
        select(Coupon).where(
            Coupon.client_id == client_id,
            Coupon.code == payload.code.strip().upper(),
        )
    )
    coupon = result.scalar_one_or_none()
    
    if not coupon:
        return CouponValidateResponse(
            valid=False,
            message="Coupon not found",
        )
    
    # Validate (using a dummy user ID for admin preview)
    is_valid, error_msg = await _validate_coupon_for_user(
        db, coupon, admin.id, payload.plan_id, payload.amount
    )
    
    if not is_valid:
        return CouponValidateResponse(
            valid=False,
            message=error_msg,
        )
    
    # Calculate discount
    discount_amount, final_amount = _calculate_discount(coupon, payload.amount)
    
    return CouponValidateResponse(
        valid=True,
        message="Coupon is valid",
        discount_amount=discount_amount,
        final_amount=final_amount,
        coupon=CouponOut.model_validate(coupon),
    )
