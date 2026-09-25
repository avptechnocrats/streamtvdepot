import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ContentPartnerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    contact_name: str = Field(min_length=1, max_length=255)
    contact_email: str = Field(min_length=3, max_length=255)
    subscription_share_percent: float = Field(ge=0, le=100)
    rental_share_percent: float = Field(ge=0, le=100)
    ppv_share_percent: float = Field(ge=0, le=100)
    settlement_currency: str = Field(default="USD", min_length=3, max_length=10)

    @field_validator("contact_email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ContentPartnerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    contact_name: str | None = Field(default=None, min_length=1, max_length=255)
    subscription_share_percent: float | None = Field(default=None, ge=0, le=100)
    rental_share_percent: float | None = Field(default=None, ge=0, le=100)
    ppv_share_percent: float | None = Field(default=None, ge=0, le=100)
    settlement_currency: str | None = Field(default=None, min_length=3, max_length=10)
    status: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value != "inactive":
            raise ValueError("Partners can only be deactivated manually")
        return value


class ContentPartnerOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    name: str
    legal_name: str | None
    contact_name: str
    contact_email: str
    status: str
    subscription_share_percent: float
    rental_share_percent: float
    ppv_share_percent: float
    settlement_currency: str
    created_at: datetime
    account_invited: bool = False

    model_config = {"from_attributes": True}