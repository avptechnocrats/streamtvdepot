import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.storage import media_display_url
from app.models.client.content import MediaAsset
from app.models.client.banner import ClientBanner, ClientBannerImage
from app.models.superadmin.client import Client
from app.schemas.client.banners import BannerIn, BannerOut, BannerPage, BannerPosition


async def banner_payload_for_storage(payload: BannerIn, client_id: uuid.UUID, db: AsyncSession) -> dict:
    asset_ids = {image.asset_id for image in payload.images.values()}
    result = await db.execute(select(MediaAsset).where(MediaAsset.client_id == client_id, MediaAsset.id.in_(asset_ids)).with_for_update())
    assets = {asset.id: asset for asset in result.scalars().all()}
    if len(assets) != len(asset_ids):
        raise HTTPException(status_code=422, detail="Every banner image must belong to this tenant's media library")
    data = payload.model_dump(mode="json")
    for slot, image in payload.images.items():
        asset = assets[image.asset_id]
        if asset.content_type not in {"image/jpeg", "image/png", "image/webp"} or (asset.width, asset.height) != (image.width, image.height):
            raise HTTPException(status_code=422, detail=f"Invalid uploaded image or dimensions for {slot}")
        data["images"][slot]["url"] = asset.url
        data["images"][slot].pop("display_url", None)
    return data


async def read_managed_banners(client: Client, db: AsyncSession, page: BannerPage | None = None, position: BannerPosition | None = None, banner_id: uuid.UUID | None = None) -> list[BannerOut]:
    statement = select(ClientBanner).where(ClientBanner.client_id == client.id)
    if page is not None:
        statement = statement.where(ClientBanner.page == page)
    if position is not None:
        statement = statement.where(ClientBanner.position == position)
    if banner_id is not None:
        statement = statement.where(ClientBanner.id == banner_id)
    statement = statement.options(selectinload(ClientBanner.images).selectinload(ClientBannerImage.asset)).order_by(ClientBanner.created_at, ClientBanner.id).execution_options(populate_existing=True)
    result = await db.execute(statement)
    output = []
    for banner in result.scalars().all():
        images = {}
        for image in banner.images:
            asset = image.asset
            if asset is None or asset.client_id != client.id:
                continue
            images[image.size_variant] = {
                "asset_id": asset.id, "url": asset.url, "width": asset.width, "height": asset.height,
                "display_url": media_display_url(asset.s3_key, original_filename=asset.original_filename) or asset.url,
            }
        if not images:
            continue
        data = {field: getattr(banner, field) for field in ("id", "name", "link", "page", "position", "border_enabled", "border_width", "border_color", "border_radius", "padding")}
        output.append(BannerOut.model_validate({**data, "images": images}))
    return output