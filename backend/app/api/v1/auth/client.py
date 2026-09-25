from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.system_mail import send_system_email, get_client_logo_url, get_client_footer_text
from app.core.email_templates import generate_professional_email_html
from app.models.auth.password_reset import PasswordResetToken, ResetUserType
from app.models.client.user import ClientAdminUser
from app.models.superadmin.client import Client
from app.schemas.auth import (
    AdminSignupRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
)

router = APIRouter()


# ─── Client Admin Auth ────────────────────────────────────────────────────────

@router.post("/admin/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED,
             summary="Client admin self-registration")
async def client_admin_signup(payload: AdminSignupRequest, db: AsyncSession = Depends(get_db)):
    # Resolve client by slug
    client_result = await db.execute(select(Client).where(Client.slug == payload.client_slug))
    client = client_result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client platform not found")

    # Unique email per client
    existing = await db.execute(
        select(ClientAdminUser).where(
            ClientAdminUser.client_id == client.id,
            ClientAdminUser.email == payload.email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # First admin for the client becomes OWNER, rest default to ADMIN
    from app.models.client.user import AdminRole
    count_result = await db.execute(
        select(ClientAdminUser).where(ClientAdminUser.client_id == client.id)
    )
    role = AdminRole.OWNER if not count_result.scalars().first() else AdminRole.ADMIN

    user = ClientAdminUser(
        client_id=client.id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=role,
        is_email_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token_data = {"role": "client_admin", "client_id": str(client.id), "client_slug": client.slug}
    return TokenResponse(
        access_token=create_access_token(str(user.id), token_data),
        refresh_token=create_refresh_token(str(user.id), token_data),
    )


@router.post("/admin/login", response_model=TokenResponse, summary="Client admin login")
async def client_admin_login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ClientAdminUser).where(ClientAdminUser.email == payload.email)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email to activate login.",
        )

    client_result = await db.execute(select(Client).where(Client.id == user.client_id))
    client = client_result.scalar_one_or_none()
    token_data = {"role": "client_admin", "client_id": str(user.client_id), "client_slug": client.slug if client else "", "full_name": user.full_name or ""}
    return TokenResponse(
        access_token=create_access_token(str(user.id), token_data),
        refresh_token=create_refresh_token(str(user.id), token_data),
    )


@router.post("/admin/refresh", response_model=TokenResponse, summary="Client admin token refresh")
async def client_admin_refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh" or data.get("role") != "client_admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    import uuid
    result = await db.execute(
        select(ClientAdminUser).where(ClientAdminUser.id == uuid.UUID(data["sub"]))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email to activate login.",
        )

    client_result = await db.execute(select(Client).where(Client.id == user.client_id))
    client = client_result.scalar_one_or_none()
    token_data = {"role": "client_admin", "client_id": str(user.client_id), "client_slug": client.slug if client else ""}
    return TokenResponse(
        access_token=create_access_token(str(user.id), token_data),
        refresh_token=create_refresh_token(str(user.id), token_data),
    )


@router.post("/admin/change-password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Client admin change password")
async def client_admin_change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: ClientAdminUser = Depends(get_current_client_admin),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different")
    current_user.hashed_password = hash_password(payload.new_password)
    await db.flush()
    
    # Send password change confirmation email with platform branding (Platform → ClientAdmin)
    from app.core.config import settings
    
    logo_url = await get_platform_logo_url()
    company_name = settings.APP_NAME or "SignalView"
    footer_text = await get_platform_footer_text(db)
    
    body_text = (
        f"Hi {current_user.full_name},\n\n"
        "This is to confirm that your SignalView client-admin account password was successfully changed.\n\n"
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
        event_key="client_admin_change_password",
        to_email=current_user.email,
        to_name=current_user.full_name,
        subject="Your SignalView password has been changed",
        body_text=body_text,
        body_html=html_content,
        client_id=current_user.client_id,
    )


@router.post("/admin/forgot-password", response_model=ForgotPasswordResponse,
             summary="Client admin forgot password")
async def client_admin_forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    q = select(ClientAdminUser).where(ClientAdminUser.email == payload.email)
    if payload.client_slug:
        client_result = await db.execute(
            select(Client).where(Client.slug == payload.client_slug)
        )
        client = client_result.scalar_one_or_none()
        if client:
            q = q.where(ClientAdminUser.client_id == client.id)

    result = await db.execute(q)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        return ForgotPasswordResponse(
            message="If that email exists, a reset link has been sent.", reset_token=""
        )

    reset = PasswordResetToken.make(ResetUserType.CLIENT_ADMIN, user.id)
    db.add(reset)
    await db.flush()

    # Build professional HTML email with platform branding (Platform → ClientAdmin)
    from app.core.config import settings
    
    logo_url = await get_platform_logo_url()
    company_name = settings.APP_NAME or "SignalView"
    footer_text = await get_platform_footer_text(db)
    
    body_text = (
        f"Hi {user.full_name},\n\n"
        "We received a password reset request for your client-admin account.\n"
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
        event_key="client_admin_forgot_password",
        to_email=user.email,
        to_name=user.full_name,
        subject="SignalView password reset",
        body_text=body_text,
        body_html=html_content,
        client_id=user.client_id,
    )

    return ForgotPasswordResponse(
        message="Password reset token generated. Deliver via email in production.",
        reset_token=reset.token,
    )


@router.post("/admin/reset-password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Client admin reset password using token")
async def client_admin_reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == payload.token,
            PasswordResetToken.user_type == ResetUserType.CLIENT_ADMIN,
        )
    )
    reset = result.scalar_one_or_none()
    if not reset or not reset.is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user_result = await db.execute(
        select(ClientAdminUser).where(ClientAdminUser.id == reset.user_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
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
