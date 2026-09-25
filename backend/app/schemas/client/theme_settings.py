from typing import Literal

from pydantic import BaseModel, Field


RadiusType = Literal["sharp", "default", "rounded"]
BannerStyleType = Literal["static", "slider", "video"]
CardStyleType = Literal["default", "detailed"]


class ThemeSettingsIn(BaseModel):
    """Payload sent by the admin when saving theme preferences."""

    theme_id: str = Field(..., description="Theme identifier, e.g. 'dark-gold'")
    radius: RadiusType = Field("default", description="Card/border corner style")
    banner_style: BannerStyleType = Field("static", description="Homepage banner display mode")
    card_style: CardStyleType = Field("default", description="Content card hover behaviour")


class ThemeSettingsOut(BaseModel):
    """Response returned to the admin (and to the public site)."""

    theme_id: str
    radius: RadiusType
    banner_style: BannerStyleType
    card_style: CardStyleType
