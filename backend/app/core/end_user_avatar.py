import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import presign_get_url
from app.models.client.content import MediaAsset
from app.models.client.user import EndUser
from app.schemas.client.user import EndUserOut


async def load_avatar_asset_map(
    db: AsyncSession,
    *,
    client_id: uuid.UUID,
    users: list[EndUser],
) -> dict[uuid.UUID, MediaAsset]:
    asset_ids = {u.avatar_asset_id for u in users if u.avatar_asset_id}
    if not asset_ids:
        return {}

    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.client_id == client_id,
            MediaAsset.id.in_(asset_ids),
        )
    )
    assets = result.scalars().all()
    return {asset.id: asset for asset in assets}


async def resolve_avatar_asset(
    db: AsyncSession,
    *,
    client_id: uuid.UUID,
    asset_id: uuid.UUID,
) -> MediaAsset | None:
    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.client_id == client_id,
            MediaAsset.id == asset_id,
        )
    )
    return result.scalar_one_or_none()


def build_avatar_display_url(asset: MediaAsset) -> str | None:
    return presign_get_url(asset.s3_key) or asset.url


def serialize_end_user(user: EndUser, asset_map: dict[uuid.UUID, MediaAsset] | None = None) -> EndUserOut:
    out = EndUserOut.model_validate(user)
    if user.avatar_asset_id and asset_map:
        asset = asset_map.get(user.avatar_asset_id)
        out.avatar_url = build_avatar_display_url(asset) if asset else None
    return out


def serialize_end_users(users: list[EndUser], asset_map: dict[uuid.UUID, MediaAsset]) -> list[EndUserOut]:
    return [serialize_end_user(user, asset_map) for user in users]
