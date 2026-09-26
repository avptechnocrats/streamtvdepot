import uuid
from datetime import datetime, timedelta, timezone
import hashlib
import ipaddress
import re
import secrets

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Request, status
import httpx
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_end_user
from app.core.email_templates import generate_professional_email_html
from app.core.end_user_avatar import load_avatar_asset_map, resolve_avatar_asset, serialize_end_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.core.storage import get_s3_client
from app.core.system_mail import get_client_footer_text, get_client_logo_url, send_system_email
from app.models.auth.password_reset import PasswordResetToken, ResetUserType
from app.models.client.content import MediaAsset
from app.models.client.subscription import SubscriptionStatus, UserSubscription
from app.models.client.user import EndUser
from app.models.superadmin.client import Client
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    RefreshRequest,
    ResendVerificationRequest,
    ResendVerificationResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserLoginRequest,
    UserSignupRequest,
    UserSignupResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.schemas.client.user import EndUserOut, EndUserUpdate

router = APIRouter()

_MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024
_ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_AVATAR_UPLOAD_EXPIRY_SECONDS = 15 * 60
_AVATAR_EXTENSIONS_BY_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
_DEFAULT_COUNTRY = "US"
_OTP_EXPIRY_MINUTES = 15
_MAX_OTP_ATTEMPTS = 5


def _valid_country_code(value: str | None) -> str | None:
    country = (value or "").strip().upper()
    return country if re.fullmatch(r"[A-Z]{2}", country) and country not in {"T1", "XX"} else None


def _request_ip(request: Request) -> str | None:
    for header in ("cf-connecting-ip", "x-forwarded-for", "x-real-ip"):
        value = request.headers.get(header, "").split(",", 1)[0].strip()
        try:
            if value and not ipaddress.ip_address(value).is_private:
                return value
        except ValueError:
            continue
    return None


async def _detect_country(request: Request) -> str:
    for header in ("cf-ipcountry", "x-vercel-ip-country", "x-country-code"):
        country = _valid_country_code(request.headers.get(header))
        if country:
            return country

    client_ip = _request_ip(request)
    if not client_ip:
        return _DEFAULT_COUNTRY

    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(f"https://ipapi.co/{client_ip}/country/")
            country = _valid_country_code(response.text) if response.is_success else None
            if country:
                return country

            response = await client.get(f"https://ipwho.is/{client_ip}")
        if response.is_success:
            country = _valid_country_code(response.json().get("country_code"))
            if country:
                return country
    except httpx.HTTPError:
        pass

    return _DEFAULT_COUNTRY


def _otp_hash(user: EndUser, otp: str) -> str:
    return hashlib.sha256(f"{user.id}:{otp}:{settings.SECRET_KEY}".encode()).hexdigest()


def _subscription_is_current(subscription: UserSubscription) -> bool:
    now = datetime.now(timezone.utc)
    if subscription.status == SubscriptionStatus.PAST_DUE:
        return False
    if not subscription.expires_at:
        return True
    try:
        expires_at = datetime.fromisoformat(subscription.expires_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > now


def _requires_subscription_redirect(subscriptions: list[UserSubscription] | tuple[UserSubscription, ...]) -> bool:
    return not any(_subscription_is_current(subscription) for subscription in subscriptions)


async def _send_end_user_verification_email(
    db: AsyncSession,
    user: EndUser,
    client: Client,
) -> bool:
    otp = f"{secrets.randbelow(1_000_000):06d}"
    user.email_verification_otp_hash = _otp_hash(user, otp)
    user.email_verification_otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=_OTP_EXPIRY_MINUTES)
    user.email_verification_otp_attempts = 0
    await db.flush()

    cfg = dict(client.site_config) if client.site_config else {}
    logo_url = await get_client_logo_url(db, client.id)
    company_name = cfg.get("site_title") or client.slug or "StreamTVDepot"
    footer_text = await get_client_footer_text(cfg)

    body_text = (
        f"Hi {user.full_name},\n\n"
        f"Welcome to {company_name}! Please confirm your email address to activate your account.\n\n"
        f"Your verification code: {otp}\n\n"
        f"This code expires in {_OTP_EXPIRY_MINUTES} minutes.\n"
        "If you did not create this account, you can ignore this email.\n\n"
        "Regards,\nStreamTVDepot Team"
    )

    return await send_system_email(
        db,
        event_key="end_user_verify_email",
        to_email=user.email,
        to_name=user.full_name,
        subject=f"Welcome to {company_name} - verify your email",
        body_text=body_text,
        body_html=generate_professional_email_html(
            subject=f"Welcome to {company_name} - verify your email",
            body_text=body_text,
            logo_url=logo_url,
            company_name=company_name,
            footer_text=footer_text,
        ),
        client_id=client.id,
    )


def _avatar_extension(content_type: str) -> str:
    return _AVATAR_EXTENSIONS_BY_TYPE.get(content_type, "jpg")


def _sanitize_avatar_filename(filename: str, ext: str) -> str:
    basename = (filename or "avatar").split("/")[-1].split("\\")[-1].strip()
    stem = basename.rsplit(".", 1)[0] if "." in basename else basename
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._") or "avatar"
    return f"{safe_stem}.{ext}"


class AvatarUploadPresignRequest(BaseModel):
    filename: str
    content_type: str
    file_size: int


class AvatarUploadPresignResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_at: datetime


class AvatarUploadConfirmRequest(BaseModel):
    s3_key: str
    original_filename: str
    content_type: str
    file_size: int | None = None


class AvatarUploadConfirmResponse(BaseModel):
    avatar_asset_id: uuid.UUID
    avatar_url: str | None


@router.post(
    "/signup",
    response_model=UserSignupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="End user self-registration (tenant-scoped)",
)
async def end_user_signup(
    payload: UserSignupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_result = await db.execute(select(Client).where(Client.slug == payload.client_slug))
    client = client_result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Platform not found")

    existing = await db.execute(
        select(EndUser).where(EndUser.client_id == client.id, EndUser.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = EndUser(
        client_id=client.id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        country=await _detect_country(request),
        is_active=False,
        is_email_verified=False,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    verification_email_sent = await _send_end_user_verification_email(db, user, client)

    return UserSignupResponse(
        verification_required=True,
        verification_email_sent=verification_email_sent,
        email=user.email,
        message=(
            f"Account created. We sent a verification code to {user.email}."
            if verification_email_sent
            else "Account created, but the verification code could not be sent. Use resend to try again."
        ),
    )


@router.post(
    "/verify-email",
    response_model=VerifyEmailResponse,
    summary="Verify an end user's email address using the emailed OTP",
)
async def end_user_verify_email(
    payload: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
):
    client_result = await db.execute(select(Client).where(Client.slug == payload.client_slug))
    client = client_result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP. Please try again.")

    result = await db.execute(
        select(EndUser).where(EndUser.client_id == client.id, EndUser.email == payload.email)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP. Please try again.")

    if user.is_email_verified:
        return VerifyEmailResponse(verified=True, message="Email already verified. You can sign in.")

    expires_at = user.email_verification_otp_expires_at
    if (
        not user.email_verification_otp_hash
        or not expires_at
        or expires_at <= datetime.now(timezone.utc)
        or user.email_verification_otp_attempts >= _MAX_OTP_ATTEMPTS
        or not secrets.compare_digest(user.email_verification_otp_hash, _otp_hash(user, payload.otp))
    ):
        user.email_verification_otp_attempts += 1
        await db.flush()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP. Please try again.")

    user.is_email_verified = True
    user.is_active = True
    user.email_verification_otp_hash = None
    user.email_verification_otp_expires_at = None
    user.email_verification_otp_attempts = 0
    await db.flush()
    return VerifyEmailResponse(verified=True, message="Email verified successfully. You can now sign in.")


@router.post(
    "/resend-verification",
    response_model=ResendVerificationResponse,
    summary="Resend the end-user verification email",
)
async def end_user_resend_verification(
    payload: ResendVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    generic = ResendVerificationResponse(
        message="If that account exists and is unverified, a verification email has been sent.",
    )

    client_result = await db.execute(select(Client).where(Client.slug == payload.client_slug))
    client = client_result.scalar_one_or_none()
    if not client or not client.is_active:
        return generic

    result = await db.execute(
        select(EndUser).where(EndUser.client_id == client.id, EndUser.email == payload.email)
    )
    user = result.scalar_one_or_none()
    if not user or user.is_email_verified:
        return generic

    await _send_end_user_verification_email(db, user, client)
    return generic


@router.post("/login", response_model=TokenResponse, summary="End user login (tenant-scoped)")
async def end_user_login(payload: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    client_result = await db.execute(select(Client).where(Client.slug == payload.client_slug))
    client = client_result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Platform not found")

    if payload.email:
        result = await db.execute(
            select(EndUser).where(EndUser.client_id == client.id, EndUser.email == payload.email)
        )
        user = result.scalar_one_or_none()
    else:
        result = await db.execute(
            select(EndUser).where(EndUser.client_id == client.id, EndUser.phone == payload.phone)
        )
        users = result.scalars().all()
        if len(users) > 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Multiple accounts use this phone number. Please sign in with email.",
            )
        user = users[0] if users else None

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_email_verified:
        await _send_end_user_verification_email(db, user, client)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. We sent a new OTP to your email.",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    subscriptions = await db.execute(
        select(UserSubscription).where(
            UserSubscription.client_id == client.id,
            UserSubscription.user_id == user.id,
            UserSubscription.status.in_([
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.TRIAL,
                SubscriptionStatus.PAST_DUE,
            ]),
        )
    )
    user_subscriptions = list(subscriptions.scalars())
    requires_subscription = _requires_subscription_redirect(user_subscriptions)

    token_data = {"role": "end_user", "client_id": str(client.id), "country": user.country, "email": user.email, "full_name": user.full_name or ""}
    return TokenResponse(
        access_token=create_access_token(str(user.id), token_data),
        refresh_token=create_refresh_token(
            str(user.id),
            token_data,
            expires_in_days=settings.END_USER_REFRESH_TOKEN_EXPIRE_DAYS,
        ),
        requires_subscription=requires_subscription,
    )


@router.post("/refresh", response_model=TokenResponse, summary="End user token refresh")
async def end_user_refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh" or data.get("role") != "end_user":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(EndUser).where(EndUser.id == uuid.UUID(data["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_data = {"role": "end_user", "client_id": data["client_id"], "country": user.country, "email": user.email, "full_name": user.full_name or ""}
    return TokenResponse(
        access_token=create_access_token(str(user.id), token_data),
        refresh_token=create_refresh_token(
            str(user.id),
            token_data,
            expires_in_days=settings.END_USER_REFRESH_TOKEN_EXPIRE_DAYS,
        ),
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, summary="End user change password")
async def end_user_change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: EndUser = Depends(get_current_end_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    await db.flush()

    client_result = await db.execute(select(Client).where(Client.id == current_user.client_id))
    client = client_result.scalar_one_or_none()

    cfg = dict(client.site_config) if client and client.site_config else {}
    logo_url = await get_client_logo_url(db, current_user.client_id)
    company_name = cfg.get("site_title") or (client.slug if client else "StreamTVDepot")
    footer_text = await get_client_footer_text(cfg)

    body_text = (
        f"Hi {current_user.full_name},\n\n"
        "This is to confirm that your account password was successfully changed.\n\n"
        "If you did not make this change, please contact support immediately.\n\n"
        "Regards,\nStreamTVDepot Team"
    )

    html_content = generate_professional_email_html(
        subject="Your account password has been changed",
        body_text=body_text,
        logo_url=logo_url,
        company_name=company_name,
        footer_text=footer_text,
    )

    await send_system_email(
        db,
        event_key="end_user_change_password",
        to_email=current_user.email,
        to_name=current_user.full_name,
        subject="Your account password has been changed",
        body_text=body_text,
        body_html=html_content,
        client_id=current_user.client_id,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse, summary="End user forgot password")
async def end_user_forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    q = select(EndUser).where(EndUser.email == payload.email)
    if payload.client_slug:
        client_result = await db.execute(select(Client).where(Client.slug == payload.client_slug))
        client = client_result.scalar_one_or_none()
        if client:
            q = q.where(EndUser.client_id == client.id)

    result = await db.execute(q)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        return ForgotPasswordResponse(
            message="If that email exists, a reset link has been sent.", reset_token=""
        )

    reset = PasswordResetToken.make(ResetUserType.END_USER, user.id)
    db.add(reset)
    await db.flush()

    client_result = await db.execute(select(Client).where(Client.id == user.client_id))
    client = client_result.scalar_one_or_none()

    cfg = dict(client.site_config) if client and client.site_config else {}
    logo_url = await get_client_logo_url(db, user.client_id)
    company_name = cfg.get("site_title") or (client.slug if client else "StreamTVDepot")
    footer_text = await get_client_footer_text(cfg)

    body_text = (
        f"Hi {user.full_name},\n\n"
        "We received a password reset request for your account.\n"
        f"Reset token: {reset.token}\n\n"
        "If you did not request this, please ignore this email."
    )

    html_content = generate_professional_email_html(
        subject="Password reset request",
        body_text=body_text,
        logo_url=logo_url,
        company_name=company_name,
        footer_text=footer_text,
    )

    await send_system_email(
        db,
        event_key="end_user_forgot_password",
        to_email=user.email,
        to_name=user.full_name,
        subject="Password reset request",
        body_text=body_text,
        body_html=html_content,
        client_id=user.client_id,
    )

    return ForgotPasswordResponse(
        message="Password reset token generated. Deliver via email in production.",
        reset_token=reset.token,
    )


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT, summary="End user reset password using token")
async def end_user_reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == payload.token,
            PasswordResetToken.user_type == ResetUserType.END_USER,
        )
    )
    reset = result.scalar_one_or_none()
    if not reset or not reset.is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user_result = await db.execute(select(EndUser).where(EndUser.id == reset.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    reset.is_used = True
    await db.flush()


@router.post("/account/avatar/presign", response_model=AvatarUploadPresignResponse, summary="Presign end-user avatar upload")
async def presign_avatar_upload(
    payload: AvatarUploadPresignRequest,
    current_user: EndUser = Depends(get_current_end_user),
):
    if payload.content_type not in _ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported avatar image type")
    if payload.file_size <= 0 or payload.file_size > _MAX_AVATAR_FILE_SIZE:
        raise HTTPException(status_code=422, detail="Avatar image must be between 1 byte and 5 MB")

    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="S3 storage is not configured")

    ext = _avatar_extension(payload.content_type)
    s3_key = f"clients/{current_user.client_id}/avatars/{uuid.uuid4()}.{ext}"

    try:
        s3 = get_s3_client()
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.AWS_S3_BUCKET,
                "Key": s3_key,
                "ContentType": payload.content_type,
            },
            ExpiresIn=_AVATAR_UPLOAD_EXPIRY_SECONDS,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    return AvatarUploadPresignResponse(
        upload_url=upload_url,
        s3_key=s3_key,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=_AVATAR_UPLOAD_EXPIRY_SECONDS),
    )


@router.post("/account/avatar/confirm", response_model=AvatarUploadConfirmResponse, summary="Confirm end-user avatar upload")
async def confirm_avatar_upload(
    payload: AvatarUploadConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: EndUser = Depends(get_current_end_user),
):
    expected_prefix = f"clients/{current_user.client_id}/avatars/"
    if not payload.s3_key.startswith(expected_prefix):
        raise HTTPException(status_code=403, detail="Invalid s3_key for this user")
    if payload.content_type not in _ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported avatar image type")

    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="S3 storage is not configured")

    try:
        s3 = get_s3_client()
        head = s3.head_object(Bucket=settings.AWS_S3_BUCKET, Key=payload.s3_key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(status_code=404, detail="Uploaded avatar file not found") from exc
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    object_size = payload.file_size if payload.file_size is not None else head.get("ContentLength")
    if object_size and object_size > _MAX_AVATAR_FILE_SIZE:
        raise HTTPException(status_code=422, detail="Avatar image must be 5 MB or smaller")

    avatar_ext = _avatar_extension(payload.content_type)
    safe_original_filename = _sanitize_avatar_filename(payload.original_filename, avatar_ext)
    public_url = f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{payload.s3_key}"
    asset = MediaAsset(
        client_id=current_user.client_id,
        original_filename=safe_original_filename,
        s3_key=payload.s3_key,
        url=public_url,
        file_size=object_size,
        content_type=payload.content_type,
    )
    db.add(asset)
    await db.flush()

    current_user.avatar_asset_id = asset.id
    current_user.avatar_url = asset.url
    await db.flush()

    await db.refresh(current_user)
    asset_map = await load_avatar_asset_map(
        db,
        client_id=current_user.client_id,
        users=[current_user],
    )
    out = serialize_end_user(current_user, asset_map)

    return AvatarUploadConfirmResponse(
        avatar_asset_id=asset.id,
        avatar_url=out.avatar_url,
    )


@router.get("/account", response_model=EndUserOut, summary="Get current end-user profile")
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    current_user: EndUser = Depends(get_current_end_user),
):
    asset_map = await load_avatar_asset_map(
        db,
        client_id=current_user.client_id,
        users=[current_user],
    )
    return serialize_end_user(current_user, asset_map)


@router.patch("/account", response_model=EndUserOut, summary="Update current end-user profile")
async def update_my_profile(
    payload: EndUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: EndUser = Depends(get_current_end_user),
):
    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("is_active", None)

    if "avatar_asset_id" in update_data:
        avatar_asset_id = update_data.pop("avatar_asset_id")
        if avatar_asset_id is None:
            current_user.avatar_asset_id = None
            current_user.avatar_url = None
        else:
            asset = await resolve_avatar_asset(
                db,
                client_id=current_user.client_id,
                asset_id=avatar_asset_id,
            )
            if not asset:
                raise HTTPException(status_code=404, detail="Avatar media asset not found")
            if not (asset.content_type or "").startswith("image/"):
                raise HTTPException(status_code=422, detail="Avatar media asset must be an image")
            current_user.avatar_asset_id = asset.id
            current_user.avatar_url = asset.url

    for field, value in update_data.items():
        setattr(current_user, field, value)
    try:
        await db.flush()
    except DBAPIError as exc:
        await db.rollback()
        if "value too long for type character varying" not in str(exc).lower():
            raise
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more profile fields are invalid or exceed allowed length",
        )

    await db.refresh(current_user)
    asset_map = await load_avatar_asset_map(
        db,
        client_id=current_user.client_id,
        users=[current_user],
    )
    return serialize_end_user(current_user, asset_map)


