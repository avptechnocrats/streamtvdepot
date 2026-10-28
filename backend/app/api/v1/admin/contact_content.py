from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.superadmin.client import Client
from app.schemas.client.contact_content import (
    ContactContentIn,
    ContactContentOut,
    FAQContentIn,
    FAQContentOut,
    PlatformContentOut,
)

router = APIRouter()


def _contact_config(site_config: dict) -> ContactContentOut:
    return ContactContentOut.model_validate(site_config.get("contact_content", {}))


def _faq_config(site_config: dict) -> FAQContentOut:
    return FAQContentOut.model_validate(site_config.get("faq_content", {}))


async def _get_client(client_id, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    return result.scalar_one()


@router.get("", response_model=PlatformContentOut)
async def get_platform_content(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    site_config = dict(client.site_config or {})
    return PlatformContentOut(contact=_contact_config(site_config), faq=_faq_config(site_config))


@router.put("/contact", response_model=ContactContentOut)
async def update_contact_content(
    payload: ContactContentIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    site_config = dict(client.site_config or {})
    site_config["contact_content"] = payload.model_dump()
    client.site_config = site_config
    await db.commit()
    return _contact_config(site_config)


@router.put("/faq", response_model=FAQContentOut)
async def update_faq_content(
    payload: FAQContentIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    site_config = dict(client.site_config or {})
    site_config["faq_content"] = payload.model_dump()
    client.site_config = site_config
    await db.commit()
    return _faq_config(site_config)