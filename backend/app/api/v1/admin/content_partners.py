import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, require_permissions
from app.core.security import hash_password
from app.core.system_mail import send_system_email
from app.models.auth.password_reset import PasswordResetToken, ResetUserType
from app.models.client.content import ContentPartner
from app.models.client.user import AdminRole, ClientAdminUser, ClientRole
from app.schemas.client.content_partner import ContentPartnerCreate, ContentPartnerOut, ContentPartnerUpdate

router = APIRouter()


async def _partner_out(partner: ContentPartner, db: AsyncSession) -> ContentPartnerOut:
    account = await db.scalar(select(ClientAdminUser.id).where(ClientAdminUser.content_partner_id == partner.id))
    output = ContentPartnerOut.model_validate(partner)
    output.account_invited = account is not None
    return output


@router.get("", response_model=list[ContentPartnerOut])
async def list_content_partners(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    partners = (await db.scalars(select(ContentPartner).where(ContentPartner.client_id == admin._client_id).order_by(ContentPartner.created_at.desc()))).all()
    return [await _partner_out(partner, db) for partner in partners]


@router.post("", response_model=ContentPartnerOut, status_code=status.HTTP_201_CREATED)
async def create_content_partner(
    payload: ContentPartnerCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    existing = await db.scalar(select(ClientAdminUser.id).where(
        ClientAdminUser.client_id == admin._client_id,
        ClientAdminUser.email == payload.contact_email,
    ))
    if existing:
        raise HTTPException(status_code=409, detail="This email already has a tenant account")

    partner = ContentPartner(client_id=admin._client_id, status="pending", **payload.model_dump())
    db.add(partner)
    await db.flush()

    role = await db.scalar(
        select(ClientRole).where(
            ClientRole.client_id == admin._client_id,
            ClientRole.name == "Content Partner",
        )
    )
    if not role:
        raise HTTPException(
            status_code=409,
            detail="Create a Content Partner role before inviting a content partner",
        )

    account = ClientAdminUser(
        client_id=admin._client_id,
        email=partner.contact_email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        full_name=partner.contact_name,
        role=AdminRole.ADMIN,
        role_id=role.id,
        content_partner_id=partner.id,
        is_active=False,
        is_email_verified=False,
    )
    db.add(account)
    await db.flush()
    invitation = PasswordResetToken.make(ResetUserType.CLIENT_ADMIN, account.id)
    db.add(invitation)
    await db.flush()
    setup_url = f"{settings.FRONTEND_PUBLIC_URL.rstrip('/')}/reset-password?token={invitation.token}&intent=invite"
    sent = await send_system_email(
        db, event_key="client_admin_team_invitation", to_email=account.email, to_name=account.full_name,
        subject="Set up your content partner account",
        body_text=f"Hi {account.full_name},\n\nSet your password to access your content partner catalog:\n\n{setup_url}",
        client_id=admin._client_id,
    )
    if not sent:
        raise HTTPException(status_code=503, detail="Invitation email could not be sent")
    await db.refresh(partner)
    return await _partner_out(partner, db)


@router.patch("/{partner_id}", response_model=ContentPartnerOut)
async def update_content_partner(
    partner_id: uuid.UUID,
    payload: ContentPartnerUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    partner = await db.scalar(select(ContentPartner).where(ContentPartner.id == partner_id, ContentPartner.client_id == admin._client_id))
    if not partner:
        raise HTTPException(status_code=404, detail="Content partner not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(partner, field, value)
    if "status" in payload.model_dump(exclude_unset=True):
        account = await db.scalar(select(ClientAdminUser).where(ClientAdminUser.content_partner_id == partner.id))
        if account:
            account.is_active = False
    await db.flush()
    await db.refresh(partner)
    return await _partner_out(partner, db)