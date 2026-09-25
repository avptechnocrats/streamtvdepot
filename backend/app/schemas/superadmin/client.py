import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, field_validator

from app.models.superadmin.client import ClientStatus


class CreateAdminUserPayload(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ClientCreate(BaseModel):
    name: str
    slug: str
    email: EmailStr
    phone: str | None = None
    website: str | None = None
    domain: str | None = None
    address: str | None = None
    country: str | None = None
    timezone: str = "UTC"


class ClientUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    website: str | None = None
    logo_url: str | None = None
    domain: str | None = None
    address: str | None = None
    country: str | None = None
    timezone: str | None = None
    status: ClientStatus | None = None
    is_active: bool | None = None
    theme_config: dict[str, Any] | None = None


class ClientOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    email: str
    phone: str | None
    website: str | None
    logo_url: str | None
    domain: str | None
    country: str | None
    timezone: str
    status: ClientStatus
    is_active: bool
    theme_config: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicClientOut(BaseModel):
    """Minimal public info returned to storefronts — no sensitive data."""
    id: uuid.UUID
    name: str
    slug: str
    domain: str | None
    logo_url: str | None
    timezone: str
    theme_config: dict[str, Any] | None
    is_active: bool

    model_config = {"from_attributes": True}


class ClientSubscriptionCreate(BaseModel):
    client_id: uuid.UUID
    plan_id: uuid.UUID
    started_at: str | None = None
    expires_at: str | None = None
    auto_renew: bool = True


class ClientSubscriptionOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    plan_id: uuid.UUID
    status: str
    started_at: str | None
    expires_at: str | None
    auto_renew: bool
    created_at: datetime

    model_config = {"from_attributes": True}
