import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.superadmin.client import Client
from app.schemas.client.theme_settings import ThemeSettingsIn, ThemeSettingsOut

router = APIRouter()

# Default settings returned when no theme has been saved yet
_DEFAULTS: dict = {
    "theme_id": "dark-gold",
    "radius": "default",
    "banner_style": "static",
    "card_style": "default",
}


async def _get_client(client_id: uuid.UUID, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@router.get("", response_model=ThemeSettingsOut, summary="Get theme settings")
async def get_theme_settings(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
) -> ThemeSettingsOut:
    """Return the saved theme settings for the admin's client.

    Falls back to sensible defaults when nothing has been saved yet.
    """
    client = await _get_client(admin._client_id, db)
    config: dict = client.theme_config or {}

    return ThemeSettingsOut(
        theme_id=config.get("theme_id", _DEFAULTS["theme_id"]),
        radius=config.get("radius", _DEFAULTS["radius"]),
        banner_style=config.get("banner_style", _DEFAULTS["banner_style"]),
        card_style=config.get("card_style", _DEFAULTS["card_style"]),
    )


@router.put("", response_model=ThemeSettingsOut, summary="Save theme settings")
async def save_theme_settings(
    payload: ThemeSettingsIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
) -> ThemeSettingsOut:
    """Persist theme settings into the client's ``theme_config`` JSONB column.

    Only the four UI-controlled keys are written; any other data already
    stored in ``theme_config`` (e.g. branding colours, logo) is preserved.
    """
    client = await _get_client(admin._client_id, db)

    # Merge — keep any existing keys not touched by the theme settings UI
    existing: dict = dict(client.theme_config) if client.theme_config else {}
    existing.update(
        {
            "theme_id": payload.theme_id,
            "radius": payload.radius,
            "banner_style": payload.banner_style,
            "card_style": payload.card_style,
        }
    )
    client.theme_config = existing
    await db.commit()
    await db.refresh(client)

    saved: dict = client.theme_config
    return ThemeSettingsOut(
        theme_id=saved["theme_id"],
        radius=saved["radius"],
        banner_style=saved["banner_style"],
        card_style=saved["card_style"],
    )
