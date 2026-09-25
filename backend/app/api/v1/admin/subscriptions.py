from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, get_current_client_admin_with_active_plan
from app.models.client.subscription import (
    ClientSubscriptionPlan,
    PlanType,
    SubscriptionStatus,
    UserSubscription,
)
from app.models.client.user import EndUser
from app.schemas.client.subscription import (
    ClientPlanCreate,
    ClientPlanOut,
    ClientPlanUpdate,
    SubscriptionListResponse,
    UserSubscriptionCreate,
    UserSubscriptionDetail,
    UserSubscriptionOut,
    UserSubscriptionUpdate,
)

router = APIRouter()


class PlanReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


def _validate_trial_configuration(*, plan_type: PlanType, price: float, trial_days: int) -> None:
    if trial_days < 0 or trial_days > 365:
        raise HTTPException(status_code=422, detail="trial_days must be between 0 and 365")

    if plan_type != PlanType.SUBSCRIPTION:
        if trial_days > 0:
            raise HTTPException(
                status_code=422,
                detail="Trial configuration is supported only for subscription plans",
            )
        return

    if price <= 0:
        if trial_days > 0:
            raise HTTPException(
                status_code=422,
                detail="Trial configuration is supported only for paid subscription plans",
            )
        return


def _normalize_uuid_list(values: list | None) -> list[str] | None:
    if not values:
        return None
    normalized: list[str] = []
    for value in values:
        try:
            normalized.append(str(uuid.UUID(str(value))))
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="Invalid UUID in applies_to list")
    return list(dict.fromkeys(normalized))


def _validate_applies_to_configuration(payload_data: dict, plan_type: PlanType) -> None:
    if plan_type != PlanType.SUBSCRIPTION:
        payload_data["applies_to_all_content"] = True
        payload_data["applies_to_scope"] = "content"
        payload_data["applies_to_content_ids"] = None
        payload_data["applies_to_category_ids"] = None
        return

    applies_to_all_content = bool(payload_data.get("applies_to_all_content", True))
    applies_to_scope = str(payload_data.get("applies_to_scope", "content"))
    content_ids = _normalize_uuid_list(payload_data.get("applies_to_content_ids"))
    category_ids = _normalize_uuid_list(payload_data.get("applies_to_category_ids"))

    if applies_to_scope not in ("content", "category_subcategory"):
        raise HTTPException(status_code=422, detail="applies_to_scope must be 'content' or 'category_subcategory'")

    if applies_to_all_content:
        payload_data["applies_to_content_ids"] = None
        payload_data["applies_to_category_ids"] = None
        return

    if applies_to_scope == "content":
        if not content_ids:
            raise HTTPException(status_code=422, detail="At least one content must be selected for specific applies-to scope")
        payload_data["applies_to_content_ids"] = content_ids
        payload_data["applies_to_category_ids"] = None
        return

    if not category_ids:
        raise HTTPException(status_code=422, detail="At least one category/subcategory must be selected for specific applies-to scope")
    payload_data["applies_to_category_ids"] = category_ids
    payload_data["applies_to_content_ids"] = None


# ─── Subscription Plans ───────────────────────────────────────────────────────

@router.get("/plans", response_model=list[ClientPlanOut])
async def list_plans(
    plan_type: str | None = Query(None, description="Filter by plan type: subscription, ppv, rent"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    q = (
        select(ClientSubscriptionPlan)
        .where(ClientSubscriptionPlan.client_id == admin._client_id)
        .order_by(ClientSubscriptionPlan.sort_order)
    )
    if plan_type is not None:
        q = q.where(ClientSubscriptionPlan.plan_type == plan_type)
    if is_active is not None:
        q = q.where(ClientSubscriptionPlan.is_active == is_active)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/plans", response_model=ClientPlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: ClientPlanCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    payload_data = payload.model_dump()
    payload_data["trial_requires_active_payment_method"] = bool(payload_data.get("trial_requires_active_payment_method", False))
    if payload_data["max_downloads"] > 0:
        payload_data["can_download"] = True
    _validate_applies_to_configuration(payload_data, payload_data["plan_type"])
    _validate_trial_configuration(
        plan_type=payload_data["plan_type"],
        price=float(payload_data["price"]),
        trial_days=int(payload_data.get("trial_days", 0) or 0),
    )

    plan = ClientSubscriptionPlan(client_id=admin._client_id, **payload_data)
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


@router.post("/plans/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_plans(
    items: list[PlanReorderItem],
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    """Accepts [{id, sort_order}, ...] and bulk-updates sort_order for each plan."""
    if not items:
        return
    ids = [item.id for item in items]
    result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.client_id == admin._client_id,
            ClientSubscriptionPlan.id.in_(ids),
        )
    )
    plan_map = {p.id: p for p in result.scalars().all()}
    for item in items:
        if item.id in plan_map:
            plan_map[item.id].sort_order = item.sort_order
    await db.flush()


@router.get("/plans/{plan_id}", response_model=ClientPlanOut)
async def get_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == plan_id,
            ClientSubscriptionPlan.client_id == admin._client_id,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.patch("/plans/{plan_id}", response_model=ClientPlanOut)
async def update_plan(
    plan_id: uuid.UUID,
    payload: ClientPlanUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == plan_id,
            ClientSubscriptionPlan.client_id == admin._client_id,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    updates = payload.model_dump(exclude_none=True)
    updates["trial_requires_active_payment_method"] = bool(updates.get("trial_requires_active_payment_method", plan.trial_requires_active_payment_method))
    merged_plan_type = updates.get("plan_type", plan.plan_type)
    merged_price = float(updates.get("price", plan.price))
    merged_trial_days = int(updates.get("trial_days", plan.trial_days) or 0)
    merged_payload = {
        "applies_to_all_content": updates.get("applies_to_all_content", plan.applies_to_all_content),
        "applies_to_scope": updates.get("applies_to_scope", plan.applies_to_scope),
        "applies_to_content_ids": updates.get("applies_to_content_ids", plan.applies_to_content_ids),
        "applies_to_category_ids": updates.get("applies_to_category_ids", plan.applies_to_category_ids),
    }
    _validate_applies_to_configuration(merged_payload, merged_plan_type)
    updates["applies_to_all_content"] = merged_payload["applies_to_all_content"]
    updates["applies_to_scope"] = merged_payload["applies_to_scope"]
    updates["applies_to_content_ids"] = merged_payload["applies_to_content_ids"]
    updates["applies_to_category_ids"] = merged_payload["applies_to_category_ids"]

    if updates.get("max_downloads", plan.max_downloads) > 0:
        updates["can_download"] = True

    _validate_trial_configuration(
        plan_type=merged_plan_type,
        price=merged_price,
        trial_days=merged_trial_days,
    )

    for field, value in updates.items():
        setattr(plan, field, value)
    await db.flush()
    await db.refresh(plan)
    return plan


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == plan_id,
            ClientSubscriptionPlan.client_id == admin._client_id,
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    usage_result = await db.execute(
        select(func.count())
        .select_from(UserSubscription)
        .where(
            UserSubscription.client_id == admin._client_id,
            UserSubscription.plan_id == plan_id,
        )
    )
    usage_count = int(usage_result.scalar_one() or 0)
    if usage_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This plan is assigned to one or more user subscriptions. Reassign or remove those subscriptions first.",
        )

    try:
        await db.delete(plan)
        # Force constraint checks before response so we can return a controlled API error.
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This plan cannot be deleted because it is referenced by other records.",
        )


# ─── User Subscriptions ───────────────────────────────────────────────────────

@router.get("/users", response_model=SubscriptionListResponse)
async def list_user_subscriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    subscription_status: SubscriptionStatus | None = Query(None, alias="status"),
    plan_type: PlanType | None = Query(None),
    latest_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """
    List user subscriptions with search, pagination, and status filtering.

    - **search**: matches against user email, user full name, or plan name
    - **status**: filter by subscription status (active, expired, cancelled, paused, trial)
    - **plan_type**: filter by plan type (subscription, ppv, rent)
    - **latest_only**: collapse to one row per user (their most recent subscription), instead of full history
    """
    if latest_only:
        return await _list_latest_subscription_per_user(
            db, admin._client_id, page, page_size, search, subscription_status, plan_type
        )

    base = (
        select(
            UserSubscription,
            EndUser.full_name,
            EndUser.email,
            ClientSubscriptionPlan.name,
            ClientSubscriptionPlan.price,
            ClientSubscriptionPlan.currency,
            ClientSubscriptionPlan.billing_cycle,
            ClientSubscriptionPlan.plan_type,
        )
        .join(EndUser, UserSubscription.user_id == EndUser.id, isouter=True)
        .join(
            ClientSubscriptionPlan,
            UserSubscription.plan_id == ClientSubscriptionPlan.id,
            isouter=True,
        )
        .where(UserSubscription.client_id == admin._client_id)
    )

    if search:
        base = base.where(
            or_(
                EndUser.email.ilike(f"%{search}%"),
                EndUser.full_name.ilike(f"%{search}%"),
                ClientSubscriptionPlan.name.ilike(f"%{search}%"),
            )
        )
    if subscription_status is not None:
        base = base.where(UserSubscription.status == subscription_status)
    if plan_type is not None:
        base = base.where(ClientSubscriptionPlan.plan_type == plan_type)

    total_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_result.scalar_one()

    items_result = await db.execute(
        base.offset((page - 1) * page_size)
        .limit(page_size)
        .order_by(UserSubscription.created_at.desc())
    )

    items: list[UserSubscriptionDetail] = []
    for sub, full_name, email, plan_name, plan_price, plan_currency, plan_cycle, plan_type_val in items_result.all():
        detail = UserSubscriptionDetail.model_validate(sub)
        detail.user_name = full_name
        detail.user_email = email
        detail.plan_name = plan_name
        detail.plan_price = float(plan_price) if plan_price is not None else None
        detail.plan_currency = plan_currency
        detail.plan_billing_cycle = plan_cycle
        detail.plan_type = plan_type_val
        items.append(detail)

    return SubscriptionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


async def _list_latest_subscription_per_user(
    db: AsyncSession,
    client_id: uuid.UUID,
    page: int,
    page_size: int,
    search: str | None,
    subscription_status: SubscriptionStatus | None,
    plan_type: PlanType | None,
) -> SubscriptionListResponse:
    """One row per user (their most recent subscription), via Postgres DISTINCT ON."""
    latest_q = (
        select(
            UserSubscription.id,
            UserSubscription.client_id,
            UserSubscription.user_id,
            UserSubscription.plan_id,
            UserSubscription.status,
            UserSubscription.started_at,
            UserSubscription.expires_at,
            UserSubscription.auto_renew,
            UserSubscription.cancelled_at,
            UserSubscription.executed_by,
            UserSubscription.created_at,
            EndUser.full_name,
            EndUser.email,
            ClientSubscriptionPlan.name,
            ClientSubscriptionPlan.price,
            ClientSubscriptionPlan.currency,
            ClientSubscriptionPlan.billing_cycle,
            ClientSubscriptionPlan.plan_type,
        )
        .distinct(UserSubscription.user_id)
        .join(EndUser, UserSubscription.user_id == EndUser.id, isouter=True)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id, isouter=True)
        .where(UserSubscription.client_id == client_id)
    )
    if plan_type is not None:
        latest_q = latest_q.where(ClientSubscriptionPlan.plan_type == plan_type)
    # DISTINCT ON requires the leading ORDER BY column(s) to match the distinct expression
    latest_q = latest_q.order_by(UserSubscription.user_id, UserSubscription.created_at.desc())

    latest = latest_q.subquery("latest")

    status_base = select(latest)
    if search:
        status_base = status_base.where(
            or_(
                latest.c.email.ilike(f"%{search}%"),
                latest.c.full_name.ilike(f"%{search}%"),
                latest.c.name.ilike(f"%{search}%"),
            )
        )

    outer = status_base
    if subscription_status is not None:
        outer = outer.where(latest.c.status == subscription_status)

    # Status breakdown counts (search-filtered, status-independent) — also gives us total for free
    status_subq = status_base.subquery()
    counts_result = await db.execute(
        select(status_subq.c.status, func.count()).select_from(status_subq).group_by(status_subq.c.status)
    )
    counts_map = {(s.value if hasattr(s, "value") else s): int(c) for s, c in counts_result.all()}
    total = sum(counts_map.values()) if subscription_status is None else counts_map.get(subscription_status.value, 0)
    counts = {
        "all": sum(counts_map.values()),
        "active": counts_map.get(SubscriptionStatus.ACTIVE.value, 0),
        "trial": counts_map.get(SubscriptionStatus.TRIAL.value, 0),
        "expired": counts_map.get(SubscriptionStatus.EXPIRED.value, 0),
        "cancelled": counts_map.get(SubscriptionStatus.CANCELLED.value, 0),
        "paused": counts_map.get(SubscriptionStatus.PAUSED.value, 0),
    }

    items_result = await db.execute(
        outer.offset((page - 1) * page_size).limit(page_size).order_by(latest.c.created_at.desc())
    )

    items: list[UserSubscriptionDetail] = []
    for row in items_result.all():
        detail = UserSubscriptionDetail(
            id=row.id,
            client_id=row.client_id,
            user_id=row.user_id,
            plan_id=row.plan_id,
            status=row.status,
            started_at=row.started_at,
            expires_at=row.expires_at,
            auto_renew=row.auto_renew,
            cancelled_at=row.cancelled_at,
            executed_by=row.executed_by,
            created_at=row.created_at,
            user_name=row.full_name,
            user_email=row.email,
            plan_name=row.name,
            plan_price=float(row.price) if row.price is not None else None,
            plan_currency=row.currency,
            plan_billing_cycle=row.billing_cycle,
            plan_type=row.plan_type,
        )
        items.append(detail)

    return SubscriptionListResponse(items=items, total=total, page=page, page_size=page_size, counts=counts)


@router.post("/users", response_model=UserSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def assign_user_subscription(
    payload: UserSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    # Validate that user belongs to this client
    user_check = await db.execute(
        select(EndUser).where(
            EndUser.id == payload.user_id,
            EndUser.client_id == admin._client_id,
        )
    )
    if not user_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Validate that plan belongs to this client
    plan_check = await db.execute(
        select(ClientSubscriptionPlan).where(
            ClientSubscriptionPlan.id == payload.plan_id,
            ClientSubscriptionPlan.client_id == admin._client_id,
        )
    )
    if not plan_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Plan not found")

    sub = UserSubscription(client_id=admin._client_id, **payload.model_dump())
    db.add(sub)
    await db.flush()
    await db.refresh(sub)
    return sub


@router.get("/users/{sub_id}", response_model=UserSubscriptionDetail)
async def get_user_subscription(
    sub_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(UserSubscription, EndUser, ClientSubscriptionPlan)
        .join(EndUser, UserSubscription.user_id == EndUser.id, isouter=True)
        .join(
            ClientSubscriptionPlan,
            UserSubscription.plan_id == ClientSubscriptionPlan.id,
            isouter=True,
        )
        .where(
            UserSubscription.id == sub_id,
            UserSubscription.client_id == admin._client_id,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Subscription not found")

    sub, user, plan = row
    detail = UserSubscriptionDetail.model_validate(sub)
    if user:
        detail.user_email = user.email
        detail.user_name = user.full_name
    if plan:
        detail.plan_name = plan.name
        detail.plan_price = float(plan.price)
        detail.plan_currency = plan.currency
        detail.plan_billing_cycle = plan.billing_cycle
    return detail


@router.patch("/users/{sub_id}", response_model=UserSubscriptionOut)
async def update_user_subscription(
    sub_id: uuid.UUID,
    payload: UserSubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.id == sub_id,
            UserSubscription.client_id == admin._client_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    # Validate new plan belongs to this client if being changed
    updates = payload.model_dump(exclude_none=True)
    if "plan_id" in updates:
        plan_check = await db.execute(
            select(ClientSubscriptionPlan).where(
                ClientSubscriptionPlan.id == updates["plan_id"],
                ClientSubscriptionPlan.client_id == admin._client_id,
            )
        )
        if not plan_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Plan not found")

    for field, value in updates.items():
        setattr(sub, field, value)
    await db.flush()
    await db.refresh(sub)
    return sub


@router.patch("/users/{sub_id}/cancel", response_model=UserSubscriptionOut)
async def cancel_user_subscription(
    sub_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    """Cancel (archive) a subscription. Sets status to cancelled and records cancellation time."""
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.id == sub_id,
            UserSubscription.client_id == admin._client_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.status == SubscriptionStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="Subscription is already cancelled")

    sub.status = SubscriptionStatus.CANCELLED
    sub.auto_renew = False
    sub.cancelled_at = datetime.now(timezone.utc).isoformat()
    await db.flush()
    await db.refresh(sub)
    return sub


@router.patch("/users/{sub_id}/restore", response_model=UserSubscriptionOut)
async def restore_user_subscription(
    sub_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin_with_active_plan),
):
    """Reactivate a cancelled or paused subscription."""
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.id == sub_id,
            UserSubscription.client_id == admin._client_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.status == SubscriptionStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Subscription is already active")

    sub.status = SubscriptionStatus.ACTIVE
    sub.cancelled_at = None
    await db.flush()
    await db.refresh(sub)
    return sub

