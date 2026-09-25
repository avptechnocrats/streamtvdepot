"""
Unified login endpoint — handles both superadmin and client-admin credentials
in a single request so the frontend doesn't need to fan-out to two endpoints.

Flow:
1. Try superadmin table (AdminUser).
2. If not found / wrong password → try client-admin table (ClientAdminUser).
3. If neither matches → return 401.

Hard failures (403 account-disabled) are raised immediately without falling
through to the second table, since a disabled account should never proceed.

The response includes a `role` field ("superadmin" | "client_admin") so the
frontend knows how to route the session without extra round-trips.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, verify_password, hash_password
from app.core.system_mail import send_system_email
from app.models.auth.password_reset import PasswordResetToken, ResetUserType
from app.models.client.user import ClientAdminUser
from app.models.superadmin.admin_user import AdminUser
from app.models.superadmin.client import Client
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    ResetPasswordRequest,
    TokenResponse,
)

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Unified login for superadmin and client-admin",
)
async def unified_login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Single login endpoint that accepts any admin email+password.

    Returns the same ``TokenResponse`` as the individual endpoints, extended
    with a ``role`` field so the client can branch without a second request.
    """

    # ── 1. Try superadmin ─────────────────────────────────────────────────────
    sa_result = await db.execute(
        select(AdminUser).where(AdminUser.email == payload.email)
    )
    superadmin = sa_result.scalar_one_or_none()

    if superadmin is not None:
        if not superadmin.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account disabled.",
            )
        if verify_password(payload.password, superadmin.hashed_password):
            token_data = {"role": "superadmin", "full_name": superadmin.full_name or ""}
            return TokenResponse(
                access_token=create_access_token(str(superadmin.id), token_data),
                refresh_token=create_refresh_token(str(superadmin.id), token_data),
                role="superadmin",
            )
        # Email matched but password wrong → don't fall through to client-admin
        # (prevents credential-stuffing guessing by role)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    # ── 2. Try client-admin ───────────────────────────────────────────────────
    ca_result = await db.execute(
        select(ClientAdminUser).where(ClientAdminUser.email == payload.email)
    )
    client_admin = ca_result.scalar_one_or_none()

    if client_admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    if not client_admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled.",
        )

    if not client_admin.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email to activate login.",
        )

    if not verify_password(payload.password, client_admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    client_result = await db.execute(
        select(Client).where(Client.id == client_admin.client_id)
    )
    client = client_result.scalar_one_or_none()

    token_data = {
        "role": "client_admin",
        "client_id": str(client_admin.client_id),
        "client_slug": client.slug if client else "",
        "full_name": client_admin.full_name or "",
    }
    return TokenResponse(
        access_token=create_access_token(str(client_admin.id), token_data),
        refresh_token=create_refresh_token(str(client_admin.id), token_data),
        role="client_admin",
    )


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Unified forgot password for superadmin and client-admin",
)
async def unified_forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    # 1) Resolve superadmin first by email
    sa_result = await db.execute(select(AdminUser).where(AdminUser.email == payload.email))
    superadmin = sa_result.scalar_one_or_none()

    if superadmin and superadmin.is_active:
        reset = PasswordResetToken.make(ResetUserType.SUPERADMIN, superadmin.id)
        db.add(reset)
        await db.flush()

        await send_system_email(
            db,
            event_key="superadmin_forgot_password",
            to_email=superadmin.email,
            to_name=superadmin.full_name,
            subject="SignalView password reset",
            body_text=(
                f"Hi {superadmin.full_name},\\n\\n"
                "We received a password reset request for your SignalView account.\\n"
                f"Reset token: {reset.token}\\n\\n"
                "If you did not request this, please ignore this email."
            ),
        )

        return ForgotPasswordResponse(
            message="Password reset token generated. Deliver via email in production.",
            reset_token=reset.token,
        )

    # 2) Resolve client-admin by email
    ca_result = await db.execute(select(ClientAdminUser).where(ClientAdminUser.email == payload.email))
    client_admin = ca_result.scalar_one_or_none()

    if client_admin and client_admin.is_active:
        reset = PasswordResetToken.make(ResetUserType.CLIENT_ADMIN, client_admin.id)
        db.add(reset)
        await db.flush()

        await send_system_email(
            db,
            event_key="client_admin_forgot_password",
            to_email=client_admin.email,
            to_name=client_admin.full_name,
            subject="SignalView password reset",
            body_text=(
                f"Hi {client_admin.full_name},\\n\\n"
                "We received a password reset request for your SignalView client-admin account.\\n"
                f"Reset token: {reset.token}\\n\\n"
                "If you did not request this, please ignore this email."
            ),
            client_id=client_admin.client_id,
        )

        return ForgotPasswordResponse(
            message="Password reset token generated. Deliver via email in production.",
            reset_token=reset.token,
        )

    # 3) Enumeration-safe response
    return ForgotPasswordResponse(
        message="If that email exists, a reset link has been sent.",
        reset_token="",
    )


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unified reset password for superadmin and client-admin",
)
async def unified_reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    reset_result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == payload.token)
    )
    reset = reset_result.scalar_one_or_none()

    if not reset or not reset.is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    if reset.user_type == ResetUserType.SUPERADMIN:
        user_result = await db.execute(select(AdminUser).where(AdminUser.id == reset.user_id))
        user = user_result.scalar_one_or_none()
    elif reset.user_type == ResetUserType.CLIENT_ADMIN:
        user_result = await db.execute(select(ClientAdminUser).where(ClientAdminUser.id == reset.user_id))
        user = user_result.scalar_one_or_none()
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported reset token type")

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    if reset.user_type == ResetUserType.CLIENT_ADMIN:
        user.is_email_verified = True
        user.is_active = True
        if user.content_partner_id:
            from app.models.client.content import ContentPartner

            partner_result = await db.execute(
                select(ContentPartner).where(
                    ContentPartner.id == user.content_partner_id,
                    ContentPartner.client_id == user.client_id,
                    ContentPartner.status == "pending",
                )
            )
            partner = partner_result.scalar_one_or_none()
            if partner:
                partner.status = "active"
    reset.is_used = True
    await db.flush()
