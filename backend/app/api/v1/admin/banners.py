import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.core.banner_management import banner_payload_for_storage, read_managed_banners
from app.models.client.banner import ClientBanner, ClientBannerImage
from app.schemas.client.banners import BannerIn, BannerOut
from .menus import _get_client

router = APIRouter()

async def _get_banner(banner_id: uuid.UUID, client_id: uuid.UUID, db: AsyncSession) -> ClientBanner:
    result = await db.execute(select(ClientBanner).where(ClientBanner.id == banner_id, ClientBanner.client_id == client_id).with_for_update())
    banner = result.scalar_one_or_none()
    if banner is None:
        raise HTTPException(status_code=404, detail="Banner not found")
    return banner


@router.get("", response_model=list[BannerOut])
async def list_banners(db: AsyncSession = Depends(get_db), admin=Depends(get_current_client_admin)):
    client = await _get_client(admin._client_id, db)
    return await read_managed_banners(client, db)


@router.post("", response_model=BannerOut, status_code=201)
async def create_banner(payload: BannerIn, db: AsyncSession = Depends(get_db), admin=Depends(get_current_client_admin)):
    client = await _get_client(admin._client_id, db)
    data = await banner_payload_for_storage(payload, client.id, db)
    images = data.pop("images")
    banner = ClientBanner(client_id=client.id, **data)
    banner.images = [ClientBannerImage(client_id=client.id, size_variant=variant, media_asset_id=uuid.UUID(image["asset_id"])) for variant, image in images.items()]
    db.add(banner)
    await db.flush()
    output = (await read_managed_banners(client, db, banner_id=banner.id))[0]
    await db.commit()
    return output


@router.put("/{banner_id}", response_model=BannerOut)
async def update_banner(banner_id: uuid.UUID, payload: BannerIn, db: AsyncSession = Depends(get_db), admin=Depends(get_current_client_admin)):
    client = await _get_client(admin._client_id, db)
    banner = await _get_banner(banner_id, client.id, db)
    data = await banner_payload_for_storage(payload, client.id, db)
    images = data.pop("images")
    for field, value in data.items():
        setattr(banner, field, value)
    await db.execute(delete(ClientBannerImage).where(ClientBannerImage.banner_id == banner.id, ClientBannerImage.client_id == client.id))
    for variant, image in images.items():
        db.add(ClientBannerImage(client_id=client.id, banner_id=banner.id, size_variant=variant, media_asset_id=uuid.UUID(image["asset_id"])))
    await db.flush()
    output = (await read_managed_banners(client, db, banner_id=banner.id))[0]
    await db.commit()
    return output


@router.delete("/{banner_id}", status_code=204)
async def delete_banner(banner_id: uuid.UUID, db: AsyncSession = Depends(get_db), admin=Depends(get_current_client_admin)):
    banner = await _get_banner(banner_id, admin._client_id, db)
    await db.delete(banner)
    await db.commit()
    return Response(status_code=204)