import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.end_user_avatar import load_avatar_asset_map, serialize_end_user, serialize_end_users
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, require_permissions
from app.core.config import settings
from app.core.security import hash_password
from app.core.system_mail import send_system_email
from app.models.auth.password_reset import PasswordResetToken, ResetUserType
from app.models.client.subscription import ClientSubscriptionPlan, SubscriptionStatus, UserSubscription
from app.models.client.user import AdminRole, ClientAdminUser, ClientRole, EndUser
from app.models.superadmin.client import Client
from app.schemas.client.user import (
    ClientAdminUserCreate,
    ClientAdminUserOut,
    ClientAdminUserUpdate,
    EndUserCreate,
    EndUserDetail,
    EndUserOut,
    EndUserUpdate,
    UserListResponse,
)

router = APIRouter()


# ─── End Users ───────────────────────────────────────────────────────────────

@router.get("", response_model=UserListResponse)
async def list_end_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    status_base = select(EndUser).where(EndUser.client_id == admin._client_id)
    if search:
        status_base = status_base.where(
            EndUser.email.ilike(f"%{search}%") | EndUser.full_name.ilike(f"%{search}%")
        )

    base = status_base
    if is_active is not None:
        base = base.where(EndUser.is_active.is_(is_active))

    status_subq = status_base.subquery()
    counts_result = await db.execute(
        select(status_subq.c.is_active, func.count())
        .select_from(status_subq)
        .group_by(status_subq.c.is_active)
    )
    counts_map = {bool(k): int(v) for k, v in counts_result.all()}
    active_count = counts_map.get(True, 0)
    inactive_count = counts_map.get(False, 0)
    # total is derivable from the same grouped counts above, avoiding a separate count query
    total = active_count + inactive_count if is_active is None else counts_map.get(is_active, 0)

    items_result = await db.execute(
        base.offset((page - 1) * page_size).limit(page_size).order_by(EndUser.created_at.desc())
    )
    users = items_result.scalars().all()
    asset_map = await load_avatar_asset_map(
        db,
        client_id=admin._client_id,
        users=users,
    )

    return UserListResponse(
        items=serialize_end_users(users, asset_map),
        total=total,
        page=page,
        page_size=page_size,
        counts={"all": active_count + inactive_count, "active": active_count, "inactive": inactive_count},
    )


@router.post("", response_model=EndUserOut, status_code=status.HTTP_201_CREATED)
async def create_end_user(
    payload: EndUserCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    existing = await db.execute(
        select(EndUser).where(
            EndUser.client_id == admin._client_id, EndUser.email == payload.email
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = EndUser(
        client_id=admin._client_id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        country=payload.country,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=EndUserDetail)
async def get_end_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(EndUser).where(EndUser.id == user_id, EndUser.client_id == admin._client_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Subscription summary
    subs_result = await db.execute(
        select(UserSubscription, ClientSubscriptionPlan)
        .join(
            ClientSubscriptionPlan,
            UserSubscription.plan_id == ClientSubscriptionPlan.id,
            isouter=True,
        )
        .where(
            UserSubscription.user_id == user_id,
            UserSubscription.client_id == admin._client_id,
        )
        .order_by(UserSubscription.created_at.desc())
    )
    rows = subs_result.all()

    active_sub = next(
        (row for row in rows if row[0].status == SubscriptionStatus.ACTIVE), None
    )

    asset_map = await load_avatar_asset_map(
        db,
        client_id=admin._client_id,
        users=[user],
    )
    user_out = serialize_end_user(user, asset_map)
    detail = EndUserDetail.model_validate(user_out.model_dump())
    detail.total_subscriptions = len(rows)
    if active_sub:
        detail.active_subscription_id = active_sub[0].id
        detail.active_subscription_plan = active_sub[1].name if active_sub[1] else None

    return detail


@router.patch("/{user_id}", response_model=EndUserOut)
async def update_end_user(
    user_id: uuid.UUID,
    payload: EndUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(EndUser).where(EndUser.id == user_id, EndUser.client_id == admin._client_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    asset_map = await load_avatar_asset_map(
        db,
        client_id=admin._client_id,
        users=[user],
    )
    return serialize_end_user(user, asset_map)


@router.patch("/{user_id}/archive", response_model=EndUserOut)
async def archive_end_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Deactivate (soft-delete) a user. They remain in the database."""
    result = await db.execute(
        select(EndUser).where(EndUser.id == user_id, EndUser.client_id == admin._client_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await db.flush()
    await db.refresh(user)
    asset_map = await load_avatar_asset_map(
        db,
        client_id=admin._client_id,
        users=[user],
    )
    return serialize_end_user(user, asset_map)


@router.patch("/{user_id}/restore", response_model=EndUserOut)
async def restore_end_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Reactivate a previously archived user."""
    result = await db.execute(
        select(EndUser).where(EndUser.id == user_id, EndUser.client_id == admin._client_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    await db.flush()
    await db.refresh(user)
    asset_map = await load_avatar_asset_map(
        db,
        client_id=admin._client_id,
        users=[user],
    )
    return serialize_end_user(user, asset_map)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_end_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Permanently delete a user and all associated data."""
    result = await db.execute(
        select(EndUser).where(EndUser.id == user_id, EndUser.client_id == admin._client_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)


# ─── Sub-admin Users ─────────────────────────────────────────────────────────

@router.get("/admins/list", response_model=list[ClientAdminUserOut])
async def list_admin_users(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    result = await db.execute(
        select(ClientAdminUser).where(ClientAdminUser.client_id == admin._client_id)
    )
    return result.scalars().all()


@router.post("/admins", response_model=ClientAdminUserOut, status_code=status.HTTP_201_CREATED)
async def create_admin_user(
    payload: ClientAdminUserCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    if payload.role_id is None:
        raise HTTPException(status_code=422, detail="A role is required")
    role_result = await db.execute(
        select(ClientRole).where(
            ClientRole.id == payload.role_id,
            ClientRole.client_id == admin._client_id,
        )
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=422, detail="Selected role is not available for this tenant")
    if role.is_owner_role:
        raise HTTPException(status_code=403, detail="Only the registering tenant user can hold the Owner role")
    client_result = await db.execute(
        select(Client).where(Client.id == admin._client_id)
    )
    client = client_result.scalar_one_or_none()
    platform_name = client.name if client else "your platform"
    existing = await db.execute(
        select(ClientAdminUser).where(
            ClientAdminUser.client_id == admin._client_id,
            ClientAdminUser.email == payload.email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An admin with this email already exists")
    user = ClientAdminUser(
        client_id=admin._client_id,
        email=payload.email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        full_name=payload.full_name,
        role=AdminRole.ADMIN,
        role_id=payload.role_id,
        is_active=False,
        is_email_verified=False,
    )
    db.add(user)
    await db.flush()
    invitation = PasswordResetToken.make(ResetUserType.CLIENT_ADMIN, user.id)
    db.add(invitation)
    await db.flush()
    setup_url = (
        f"{settings.FRONTEND_PUBLIC_URL.rstrip('/')}/reset-password"
        f"?token={invitation.token}&intent=invite"
    )
    invitation_sent = await send_system_email(
        db,
        event_key="client_admin_team_invitation",
        to_email=user.email,
        to_name=user.full_name,
        subject=f"Set up your {platform_name} team account",
        body_text=(
            f"Hi {user.full_name},\n\n"
            f"You have been invited to the {platform_name} team. Set your password "
            f"to activate your account:\n\n{setup_url}\n\n"
            "This link expires in two hours."
        ),
        client_id=admin._client_id,
    )
    if not invitation_sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitation email could not be sent. The team member was not created.",
        )
    await db.refresh(user)
    return user


@router.post("/admins/{admin_user_id}/resend-invitation", status_code=status.HTTP_204_NO_CONTENT)
async def resend_admin_invitation(
    admin_user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    user_result = await db.execute(
        select(ClientAdminUser).where(
            ClientAdminUser.id == admin_user_id,
            ClientAdminUser.client_id == admin._client_id,
        )
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    if user.role == AdminRole.OWNER or user.is_active:
        raise HTTPException(status_code=422, detail="This team member does not have a pending invitation")

    client_result = await db.execute(select(Client).where(Client.id == admin._client_id))
    client = client_result.scalar_one_or_none()
    platform_name = client.name if client else "your platform"
    previous_tokens = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_type == ResetUserType.CLIENT_ADMIN,
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.is_used.is_(False),
        )
    )
    for token in previous_tokens.scalars():
        token.is_used = True

    user.is_email_verified = False
    invitation = PasswordResetToken.make(ResetUserType.CLIENT_ADMIN, user.id)
    db.add(invitation)
    await db.flush()
    setup_url = (
        f"{settings.FRONTEND_PUBLIC_URL.rstrip('/')}/reset-password"
        f"?token={invitation.token}&intent=invite"
    )
    invitation_sent = await send_system_email(
        db,
        event_key="client_admin_team_invitation_resent",
        to_email=user.email,
        to_name=user.full_name,
        subject=f"Set up your {platform_name} team account",
        body_text=(
            f"Hi {user.full_name},\n\n"
            f"You have been invited to the {platform_name} team. Set your password "
            f"to activate your account:\n\n{setup_url}\n\n"
            "This link expires in two hours."
        ),
        client_id=admin._client_id,
    )
    if not invitation_sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invitation email could not be sent.",
        )


@router.patch("/admins/{admin_user_id}", response_model=ClientAdminUserOut)
async def update_admin_user(
    admin_user_id: uuid.UUID,
    payload: ClientAdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    result = await db.execute(
        select(ClientAdminUser).where(
            ClientAdminUser.id == admin_user_id,
            ClientAdminUser.client_id == admin._client_id,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    if payload.role is not None:
        raise HTTPException(status_code=422, detail="Use role_id to change an admin's access role")
    if user.role == AdminRole.OWNER and (payload.role_id is not None or payload.is_active is False):
        raise HTTPException(status_code=403, detail="The tenant owner account cannot be reassigned or deactivated")
    if payload.role_id is not None:
        role_result = await db.execute(
            select(ClientRole).where(
                ClientRole.id == payload.role_id,
                ClientRole.client_id == admin._client_id,
            )
        )
        role = role_result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=422, detail="Selected role is not available for this tenant")
        if role.is_owner_role:
            raise HTTPException(status_code=403, detail="Only the tenant owner can hold the Owner role")
        user.role_id = role.id
    for field, value in payload.model_dump(exclude_none=True, exclude={"role_id", "role"}).items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/admins/{admin_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_user(
    admin_user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    result = await db.execute(
        select(ClientAdminUser).where(
            ClientAdminUser.id == admin_user_id,
            ClientAdminUser.client_id == admin._client_id,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    if user.role == AdminRole.OWNER:
        raise HTTPException(status_code=403, detail="The tenant Owner account cannot be deleted")
    if user.id == admin.id:
        raise HTTPException(status_code=403, detail="You cannot delete your own account")

    reset_tokens = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_type == ResetUserType.CLIENT_ADMIN,
            PasswordResetToken.user_id == user.id,
        )
    )
    for reset_token in reset_tokens.scalars():
        await db.delete(reset_token)
    await db.delete(user)
