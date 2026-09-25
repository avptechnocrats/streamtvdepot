import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.schemas.superadmin.plan import SaasPlanCreate, SaasPlanOut, SaasPlanUpdate

router = APIRouter()


# ── List active plans ─────────────────────────────────────────────────────────
@router.get("", response_model=list[SaasPlanOut])
async def list_plans(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(SaasSubscriptionPlan)
        .where(SaasSubscriptionPlan.deleted_at.is_(None))
        .order_by(SaasSubscriptionPlan.price_monthly)
    )
    return result.scalars().all()


# ── List trashed plans ────────────────────────────────────────────────────────
@router.get("/trash", response_model=list[SaasPlanOut])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(SaasSubscriptionPlan)
        .where(SaasSubscriptionPlan.deleted_at.isnot(None))
        .order_by(SaasSubscriptionPlan.deleted_at.desc())
    )
    return result.scalars().all()


# ── Create plan ───────────────────────────────────────────────────────────────
@router.post("", response_model=SaasPlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: SaasPlanCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    existing = await db.execute(
        select(SaasSubscriptionPlan).where(SaasSubscriptionPlan.slug == payload.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Plan slug already exists")

    plan = SaasSubscriptionPlan(**payload.model_dump())
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


# ── Get single plan ───────────────────────────────────────────────────────────
@router.get("/{plan_id}", response_model=SaasPlanOut)
async def get_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    plan = await _get_active_plan(plan_id, db)
    return plan


# ── Update plan ───────────────────────────────────────────────────────────────
@router.patch("/{plan_id}", response_model=SaasPlanOut)
async def update_plan(
    plan_id: uuid.UUID,
    payload: SaasPlanUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    plan = await _get_active_plan(plan_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(plan, field, value)
    await db.flush()
    await db.refresh(plan)
    return plan


# ── Toggle active/inactive ────────────────────────────────────────────────────
@router.patch("/{plan_id}/toggle", response_model=SaasPlanOut)
async def toggle_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    plan = await _get_active_plan(plan_id, db)
    plan.is_active = not plan.is_active
    await db.flush()
    await db.refresh(plan)
    return plan


# ── Soft delete (move to trash) ───────────────────────────────────────────────
@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    plan = await _get_active_plan(plan_id, db)
    plan.deleted_at = datetime.now(timezone.utc)
    await db.flush()


# ── Restore from trash ────────────────────────────────────────────────────────
@router.post("/{plan_id}/restore", response_model=SaasPlanOut)
async def restore_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(SaasSubscriptionPlan).where(
            SaasSubscriptionPlan.id == plan_id,
            SaasSubscriptionPlan.deleted_at.isnot(None),
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found in trash")
    plan.deleted_at = None
    await db.flush()
    await db.refresh(plan)
    return plan


# ── Permanent delete ──────────────────────────────────────────────────────────
@router.delete("/{plan_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanent_delete_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(SaasSubscriptionPlan).where(
            SaasSubscriptionPlan.id == plan_id,
            SaasSubscriptionPlan.deleted_at.isnot(None),
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found in trash")
    await db.delete(plan)


# ── Helper ────────────────────────────────────────────────────────────────────
async def _get_active_plan(plan_id: uuid.UUID, db: AsyncSession) -> SaasSubscriptionPlan:
    result = await db.execute(
        select(SaasSubscriptionPlan).where(
            SaasSubscriptionPlan.id == plan_id,
            SaasSubscriptionPlan.deleted_at.is_(None),
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan

