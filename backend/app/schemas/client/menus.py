from typing import Literal

from pydantic import BaseModel, Field


MenuPosition = Literal["header", "footer"]
MenuLinkTarget = Literal["_self", "_blank"]
MenuItemType = Literal["name", "icon"]


class MenuLinkCreate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=120)
    url: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(None, max_length=500)
    target: MenuLinkTarget = "_self"
    item_type: MenuItemType = "name"
    icon: str | None = Field(None, min_length=1, max_length=80)
    column_index: int | None = Field(None, ge=1, le=12)


class MenuLinkUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=120)
    url: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = Field(None, max_length=500)
    target: MenuLinkTarget | None = None
    item_type: MenuItemType | None = None
    icon: str | None = Field(None, min_length=1, max_length=80)
    column_index: int | None = Field(None, ge=1, le=12)


class MenuLinkOut(BaseModel):
    id: str
    label: str | None = None
    url: str
    sort_order: int
    description: str | None = None
    target: MenuLinkTarget = "_self"
    item_type: MenuItemType = "name"
    icon: str | None = None
    column_index: int = 1


class MenuGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    position: MenuPosition
    footer_columns: int | None = Field(None, ge=1, le=12)


class MenuGroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    footer_columns: int | None = Field(None, ge=1, le=12)


class MenuGroupOut(BaseModel):
    id: str
    name: str
    position: MenuPosition
    is_active: bool
    sort_order: int
    footer_columns: int = 1
    links: list[MenuLinkOut] = Field(default_factory=list)


class ActiveMenusOut(BaseModel):
    header: MenuGroupOut | None = None
    footer: MenuGroupOut | None = None


class MenuLinksReorderIn(BaseModel):
    link_ids: list[str] = Field(..., min_length=1)
