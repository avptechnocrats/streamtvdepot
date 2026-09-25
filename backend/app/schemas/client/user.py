import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.client.user import AdminRole


class ClientPermissionOut(BaseModel):
    code: str
    module: str
    description: str

    model_config = {"from_attributes": True}


class ClientRoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    permission_codes: list[str] = Field(default_factory=list)


class ClientRoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    permission_codes: list[str] | None = None


class ClientRoleOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    name: str
    description: str | None
    is_owner_role: bool
    is_system_role: bool
    permission_codes: list[str]
    assigned_users_count: int


class ClientAdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: AdminRole = AdminRole.ADMIN
    role_id: uuid.UUID | None = None


class ClientAdminUserUpdate(BaseModel):
    full_name: str | None = None
    role: AdminRole | None = None
    role_id: uuid.UUID | None = None
    is_active: bool | None = None


class ClientAdminUserOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    email: str
    full_name: str
    role: AdminRole
    role_id: uuid.UUID | None
    is_active: bool
    is_email_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class EndUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str | None = None
    country: str | None = None


class EndUserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    avatar_asset_id: uuid.UUID | None = None
    country: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None
    billing_line1: str | None = Field(default=None, max_length=255)
    billing_line2: str | None = Field(default=None, max_length=255)
    billing_city: str | None = Field(default=None, max_length=100)
    billing_state: str | None = Field(default=None, max_length=100)
    billing_postal_code: str | None = Field(default=None, max_length=20)
    billing_country: str | None = Field(default=None, max_length=2)  # ISO 3166-1 alpha-2


class EndUserOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    avatar_asset_id: uuid.UUID | None
    avatar_url: str | None
    country: str | None
    billing_line1: str | None
    billing_line2: str | None
    billing_city: str | None
    billing_state: str | None
    billing_postal_code: str | None
    billing_country: str | None
    is_active: bool
    is_email_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EndUserDetail(EndUserOut):
    """Extended user view returned by GET /users/{id}, includes subscription summary."""
    active_subscription_id: uuid.UUID | None = None
    active_subscription_plan: str | None = None
    total_subscriptions: int = 0


class UserListResponse(BaseModel):
    items: list[EndUserOut]
    total: int
    page: int
    page_size: int
    counts: dict[str, int] = Field(default_factory=dict)
