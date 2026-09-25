"""
Public SAAS registration endpoint.

POST /auth/register
  - Creates a new Client record (slug must be globally unique)
  - Creates the first ClientAdminUser with role=OWNER
    - Sends an email verification link to activate login
  - No authentication required
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.demo_provision import provision_demo_content
from app.core.security import create_email_verification_token, decode_token, hash_password
from app.core.subscription import ensure_trial_subscription
from app.core.system_mail import get_platform_notification_email, send_system_email
from app.models.client.user import AdminRole, ClientAdminUser, ClientPermission, ClientRole
from app.models.superadmin.client import Client, ClientStatus, ClientSubscription
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.schemas.auth import SaasRegisterRequest, SaasRegisterResponse, VerifyEmailResponse

router = APIRouter()


@router.post(
    "/register",
    response_model=SaasRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="SAAS self-registration — creates Client + owner admin in one step",
    tags=["Auth – Registration"],
)
async def saas_register(payload: SaasRegisterRequest, db: AsyncSession = Depends(get_db)):
    # ── 1. Guard: slug uniqueness ──────────────────────────────────────────────
    slug_exists = await db.execute(
        select(Client.id).where(Client.slug == payload.platform_slug)
    )
    if slug_exists.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Platform slug is already taken. Choose a different one.",
        )

    # ── 2. Guard: domain uniqueness (if provided) ──────────────────────────────
    if payload.domain:
        domain_exists = await db.execute(
            select(Client.id).where(Client.domain == payload.domain)
        )
        if domain_exists.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Domain is already registered to another platform.",
            )

    # ── 3. Guard: email already used as a client admin anywhere ───────────────
    email_exists = await db.execute(
        select(ClientAdminUser.id).where(ClientAdminUser.email == payload.email)
    )
    if email_exists.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered.",
        )

    # ── 4. Create Client ──────────────────────────────────────────────────────
    client = Client(
        name=payload.platform_name,
        slug=payload.platform_slug,
        domain=payload.domain,
        email=payload.email,
        phone=payload.phone,
        country=payload.country,
        timezone=payload.timezone,
        status=ClientStatus.TRIAL,
        is_active=True,
    )
    db.add(client)
    # flush so we get client.id without committing yet
    await db.flush()

    # ── 5. Create the protected Owner role and assign it to the registering user ─
    permissions_result = await db.execute(select(ClientPermission))
    all_permissions = permissions_result.scalars().all()
    owner_role = ClientRole(
        client_id=client.id,
        name="Owner",
        description="Full control of this platform",
        is_owner_role=True,
        is_system_role=True,
        permissions=all_permissions,
    )
    db.add(owner_role)
    await db.flush()

    content_partner_role = ClientRole(
        client_id=client.id,
        name="Content Partner",
        description="Catalog upload access scoped to the assigned content partner",
        permissions=[
            permission
            for permission in all_permissions
            if permission.code in {"content.view", "content.create", "content.update"}
        ],
    )
    db.add(content_partner_role)

    owner = ClientAdminUser(
        client_id=client.id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=AdminRole.OWNER,
        role_id=owner_role.id,
        is_active=True,
        is_email_verified=False,
    )
    db.add(owner)
    await db.flush()

    # ── 6. Provision demo content, then commit everything in one transaction ───
    # Best-effort: a missing migration or empty seed must never block signup.
    try:
        await provision_demo_content(client.id, db)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning(
            "Demo provisioning skipped for new signup %s: %s", client.id, exc
        )
    await db.commit()
    await db.refresh(client)
    await db.refresh(owner)

    verification_token = create_email_verification_token(
        str(owner.id),
        {"role": "client_admin", "client_id": str(client.id)},
    )
    verify_url = (
        f"{settings.FRONTEND_PUBLIC_URL.rstrip('/')}/verify-email"
        f"?token={verification_token}"
    )

    # Best-effort verification mail; never block account creation.
    verification_email_sent = await send_system_email(
        db,
        event_key="client_signup_verify_email",
        to_email=owner.email,
        to_name=owner.full_name,
        subject="Verify your SignalView account",
        body_text=(
            f"Hi {owner.full_name},\n\n"
            f"Your SignalView workspace '{client.name}' has been created.\n"
            "Please verify your email to activate your account and log in.\n\n"
            f"Verification link: {verify_url}\n\n"
            "Regards,\nSignalView Team"
        ),
        client_id=client.id,
        metadata={"client_slug": client.slug, "client_name": client.name},
    )

    admin_notify_email = await get_platform_notification_email(db)
    if admin_notify_email:
        await send_system_email(
            db,
            event_key="client_signup_superadmin_notice",
            to_email=admin_notify_email,
            subject=f"New SaaS signup: {client.name}",
            body_text=(
                "A new client registered on SignalView.\n\n"
                f"Client: {client.name}\n"
                f"Slug: {client.slug}\n"
                f"Owner: {owner.full_name} <{owner.email}>\n"
                f"Country: {client.country or '-'}\n"
            ),
            client_id=client.id,
            metadata={"client_slug": client.slug, "client_name": client.name},
        )

    return SaasRegisterResponse(
        client_id=str(client.id),
        client_slug=client.slug,
        verification_email_sent=verification_email_sent,
        message=(
            "Account created. Verify your email to activate login."
            if verification_email_sent
            else "Account created, but verification email could not be sent. Contact support."
        ),
    )


@router.get(
    "/register/verify-email",
    response_model=VerifyEmailResponse,
    summary="Verify client signup email",
    tags=["Auth – Registration"],
)
async def verify_client_signup_email(token: str, db: AsyncSession = Depends(get_db)):
    token_data = decode_token(token)
    if (
        not token_data
        or token_data.get("type") != "email_verification"
        or token_data.get("role") != "client_admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token.",
        )

    try:
        user_id = uuid.UUID(str(token_data.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token subject.",
        )

    user_result = await db.execute(select(ClientAdminUser).where(ClientAdminUser.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if user.is_email_verified:
        trial_assigned = await ensure_trial_subscription(user.client_id, db)
        if not trial_assigned:
            return VerifyEmailResponse(
                verified=True,
                message="Email already verified. No active trial plan is configured by superadmin.",
            )
        return VerifyEmailResponse(verified=True, message="Email already verified. You can log in.")

    user.is_email_verified = True
    trial_assigned = await ensure_trial_subscription(user.client_id, db)
    await db.flush()

    if not trial_assigned:
        await db.commit()
        return VerifyEmailResponse(
            verified=True,
            message="Email verified successfully, but no active trial plan is configured. Contact support.",
        )

    await db.commit()
    return VerifyEmailResponse(verified=True, message="Email verified successfully. You can now log in.")
