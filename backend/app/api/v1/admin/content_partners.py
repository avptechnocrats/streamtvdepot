import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_client_admin, require_permissions
from app.core.security import hash_password
from app.core.system_mail import send_system_email
from app.models.auth.password_reset import PasswordResetToken, ResetUserType
from app.models.client.content import ContentPartner, Episode, MediaAsset, MediaAssetRendition, Video
from app.models.client.partner_delivery import PartnerContent, PartnerDelivery, PartnerIngest
from app.models.client.user import AdminRole, ClientAdminUser, ClientRole
from app.schemas.client.content_partner import ContentPartnerCreate, ContentPartnerOut, ContentPartnerUpdate, DeliveryOut, IngestOut
from app.core.partner_ingest import configure_delivery

router = APIRouter()


@router.get("/delivery-capabilities")
async def partner_delivery_capabilities(admin=Depends(get_current_client_admin), _=Depends(require_permissions("access.roles.manage"))):
    return {"enabled": settings.PARTNER_DELIVERY_ENABLED and settings.PARTNER_DELIVERY_PRIVATE_SOURCES_CONFIRMED,
        "region": settings.PARTNER_DELIVERY_REGION, "metadata_formats": ["none", "filmhub_csv_3"]}


async def _partner_out(partner: ContentPartner, db: AsyncSession) -> ContentPartnerOut:
    account = await db.scalar(select(ClientAdminUser.id).where(ClientAdminUser.client_id == partner.client_id, ClientAdminUser.content_partner_id == partner.id))
    output = ContentPartnerOut.model_validate(partner)
    output.account_invited = account is not None
    delivery = await db.scalar(select(PartnerDelivery).where(PartnerDelivery.client_id == partner.client_id, PartnerDelivery.partner_id == partner.id))
    if delivery:
        output.delivery = DeliveryOut.model_validate(delivery)
        output.delivery.delivery_uri = f"s3://{delivery.bucket}/{delivery.prefix}"
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
    if payload.invite_account:
        existing = await db.scalar(select(ClientAdminUser.id).where(
            ClientAdminUser.client_id == admin._client_id,
            ClientAdminUser.email == payload.contact_email,
        ))
        if existing:
            raise HTTPException(status_code=409, detail="This email already has a tenant account")

    partner = ContentPartner(client_id=admin._client_id, status="pending" if payload.invite_account else "active", **payload.model_dump(exclude={"delivery", "invite_account"}))
    db.add(partner)
    await db.flush()
    if payload.delivery:
        try:
            await configure_delivery(db, partner, payload.delivery.model_dump())
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    if not payload.invite_account:
        await db.flush()
        return await _partner_out(partner, db)

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
    if "delivery" in payload.model_fields_set:
        try:
            await configure_delivery(db, partner, payload.delivery.model_dump() if payload.delivery else None)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    for field, value in payload.model_dump(exclude_unset=True, exclude={"delivery"}).items():
        setattr(partner, field, value)
    if "status" in payload.model_dump(exclude_unset=True):
        account = await db.scalar(select(ClientAdminUser).where(ClientAdminUser.client_id == admin._client_id, ClientAdminUser.content_partner_id == partner.id))
        if account:
            account.is_active = False
        delivery = await db.scalar(select(PartnerDelivery).where(PartnerDelivery.client_id == admin._client_id, PartnerDelivery.partner_id == partner.id))
        if delivery:
            delivery.enabled, delivery.status, delivery.attempts, delivery.next_attempt_at = False, "pending", 0, None
    await db.flush()
    await db.refresh(partner)
    return await _partner_out(partner, db)


@router.get("/{partner_id}/ingests", response_model=list[IngestOut])
async def list_partner_ingests(partner_id: uuid.UUID, page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin), _=Depends(require_permissions("access.roles.manage"))):
    ingests = (await db.scalars(select(PartnerIngest).where(
        PartnerIngest.client_id == admin._client_id, PartnerIngest.partner_id == partner_id,
    ).order_by(PartnerIngest.created_at.desc()).offset((page - 1) * 25).limit(25))).all()
    results = []
    for ingest in ingests:
        output = IngestOut.model_validate(ingest)
        media = []
        for model in (Video, Episode):
            rows = (await db.execute(select(MediaAssetRendition.status, MediaAssetRendition.progress, MediaAssetRendition.error_message).join(
                model, model.media_asset_rendition_id == MediaAssetRendition.id,
            ).join(PartnerContent, (PartnerContent.content_id == model.id) & (PartnerContent.client_id == model.client_id)).where(
                PartnerContent.client_id == admin._client_id, PartnerContent.partner_id == partner_id,
                PartnerContent.metadata_json["ingest_id"].astext == str(ingest.id),
                MediaAssetRendition.client_id == admin._client_id,
            ))).all()
            media.extend({"status": row.status, "progress": row.progress, "error": row.error_message} for row in rows)
        output.summary = {**output.summary, "media": media}
        results.append(output)
    return results


@router.post("/{partner_id}/delivery/retry", response_model=ContentPartnerOut)
async def retry_partner_delivery(partner_id: uuid.UUID, db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin), _=Depends(require_permissions("access.roles.manage"))):
    delivery = await db.scalar(select(PartnerDelivery).where(PartnerDelivery.client_id == admin._client_id, PartnerDelivery.partner_id == partner_id).with_for_update())
    partner = await db.scalar(select(ContentPartner).where(ContentPartner.client_id == admin._client_id, ContentPartner.id == partner_id))
    if not delivery or not partner:
        raise HTTPException(status_code=404, detail="Delivery configuration not found")
    delivery.status, delivery.attempts, delivery.next_attempt_at, delivery.last_reconciled_at = "pending", 0, None, None
    delivery.error = None
    await db.flush()
    return await _partner_out(partner, db)


@router.post("/{partner_id}/ingests/{ingest_id}/retry", response_model=IngestOut)
async def retry_partner_ingest(partner_id: uuid.UUID, ingest_id: uuid.UUID, db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin), _=Depends(require_permissions("access.roles.manage"))):
    ingest = await db.scalar(select(PartnerIngest).where(
        PartnerIngest.client_id == admin._client_id, PartnerIngest.partner_id == partner_id, PartnerIngest.id == ingest_id,
    ).with_for_update())
    if not ingest:
        raise HTTPException(status_code=404, detail="Package not found")
    if ingest.status == "complete":
        from app.core.episode_transcoding import prepare_media_asset_transcode
        retried = 0
        for model in (Video, Episode):
            assets = (await db.scalars(select(MediaAsset).join(MediaAssetRendition, MediaAssetRendition.media_asset_id == MediaAsset.id).join(
                model, model.media_asset_rendition_id == MediaAssetRendition.id,
            ).join(PartnerContent, (PartnerContent.content_id == model.id) & (PartnerContent.client_id == model.client_id)).where(
                PartnerContent.client_id == admin._client_id, PartnerContent.partner_id == partner_id,
                PartnerContent.metadata_json["ingest_id"].astext == str(ingest.id),
                MediaAsset.client_id == admin._client_id, MediaAssetRendition.client_id == admin._client_id,
                MediaAssetRendition.status == "failed",
            ))).all()
            for asset in assets:
                await prepare_media_asset_transcode(db, asset, retry=True)
                retried += 1
        if not retried:
            raise HTTPException(status_code=409, detail="No failed media jobs to retry; deliver updated metadata for catalog changes")
        await db.flush()
        return ingest
    ingest.status, ingest.attempts, ingest.next_attempt_at = "pending", 0, None
    await db.flush()
    return ingest


class PartnerTakedown(BaseModel):
    kind: str = Field(pattern="^(movie|series|season|episode)$")
    sku: str = Field(min_length=1, max_length=255)
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/{partner_id}/takedown")
async def takedown_partner_content(partner_id: uuid.UUID, payload: PartnerTakedown, db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin), _=Depends(require_permissions("access.roles.manage"))):
    identity = await db.scalar(select(PartnerContent).where(
        PartnerContent.client_id == admin._client_id, PartnerContent.partner_id == partner_id,
        PartnerContent.kind == payload.kind, PartnerContent.sku == payload.sku,
    ).with_for_update())
    if not identity:
        raise HTTPException(status_code=404, detail="Provider SKU not found")
    identity.revoked_at = datetime.now(timezone.utc)
    identity.metadata_json = {**identity.metadata_json, "takedown": {"reason": payload.reason, "actor_id": str(admin.id), "at": identity.revoked_at.isoformat()}}
    await db.flush()
    return {"revoked": True, "sku": payload.sku}