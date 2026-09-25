from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.system_mail import send_system_email, get_platform_logo_url, get_platform_footer_text
from app.core.email_templates import generate_professional_email_html
from app.models.auth.password_reset import PasswordResetToken, ResetUserType
from app.models.superadmin.admin_user import AdminUser
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def superadmin_login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AdminUser).where(AdminUser.email == payload.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token_data = {"role": "superadmin", "full_name": user.full_name or ""}
    return TokenResponse(
        access_token=create_access_token(str(user.id), token_data),
        refresh_token=create_refresh_token(str(user.id), token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
async def superadmin_refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh" or data.get("role") != "superadmin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    import uuid
    result = await db.execute(select(AdminUser).where(AdminUser.id == uuid.UUID(data["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_data = {"role": "superadmin"}
    return TokenResponse(
        access_token=create_access_token(str(user.id), token_data),
        refresh_token=create_refresh_token(str(user.id), token_data),
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def superadmin_change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = Depends(get_current_superadmin),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different")

    current_user.hashed_password = hash_password(payload.new_password)
    await db.flush()
    
    # Send password change confirmation email
    from app.core.config import settings
    
    logo_url = await get_platform_logo_url()
    company_name = settings.APP_NAME or "SignalView"
    footer_text = await get_platform_footer_text(db)
    
    body_text = (
        f"Hi {current_user.full_name},\n\n"
        "This is to confirm that your SignalView account password was successfully changed.\n\n"
        "If you did not make this change, please contact support immediately.\n\n"
        "Regards,\nSignalView Team"
    )
    
    html_content = generate_professional_email_html(
        subject="Your SignalView password has been changed",
        body_text=body_text,
        logo_url=logo_url,
        company_name=company_name,
        footer_text=footer_text,
    )
    
    await send_system_email(
        db,
        event_key="superadmin_change_password",
        to_email=current_user.email,
        to_name=current_user.full_name,
        subject="Your SignalView password has been changed",
        body_text=body_text,
        body_html=html_content,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def superadmin_forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AdminUser).where(AdminUser.email == payload.email))
    user = result.scalar_one_or_none()

    # Always return 200 to avoid user enumeration
    if not user or not user.is_active:
        return ForgotPasswordResponse(
            message="If that email exists, a reset link has been sent.",
            reset_token="",
        )

    reset = PasswordResetToken.make(ResetUserType.SUPERADMIN, user.id)
    db.add(reset)
    await db.flush()

    # Build professional HTML email with platform branding
    from app.core.config import settings
    
    logo_url = await get_platform_logo_url()
    company_name = settings.APP_NAME or "SignalView"
    footer_text = await get_platform_footer_text(db)
    
    body_text = (
        f"Hi {user.full_name},\n\n"
        "We received a password reset request for your SignalView account.\n"
        f"Reset token: {reset.token}\n\n"
        "If you did not request this, please ignore this email."
    )
    
    html_content = generate_professional_email_html(
        subject="SignalView password reset",
        body_text=body_text,
        logo_url=logo_url,
        company_name=company_name,
        footer_text=footer_text,
    )

    await send_system_email(
        db,
        event_key="superadmin_forgot_password",
        to_email=user.email,
        to_name=user.full_name,
        subject="SignalView password reset",
        body_text=body_text,
        body_html=html_content,
    )

    return ForgotPasswordResponse(
        message="Password reset token generated. Deliver via email in production.",
        reset_token=reset.token,
    )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def superadmin_reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == payload.token,
            PasswordResetToken.user_type == ResetUserType.SUPERADMIN,
        )
    )
    reset = result.scalar_one_or_none()

    if not reset or not reset.is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user_result = await db.execute(select(AdminUser).where(AdminUser.id == reset.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    reset.is_used = True
    await db.flush()
