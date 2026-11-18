import uuid
import re
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator


class DeliveryInput(BaseModel):
    principal_arn: str = Field(max_length=255)
    enabled: bool = True
    method: Literal["direct", "replication"] = "direct"
    metadata_format: Literal["none", "filmhub_csv_3"] = "filmhub_csv_3"
    rights_timezone: str = "UTC"
    rights_snapshot_confirmed: bool = False
    auto_publish: bool = False
    access_type: Literal["subscription", "free", "pay_per_view", "rental"] = "subscription"
    subscription_plan_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)

    @field_validator("principal_arn")
    @classmethod
    def validate_principal(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"arn:aws:iam::[0-9]{12}:(?:root|(?:user|role)/[A-Za-z0-9+=,.@_/-]+)", value):
            raise ValueError("Enter an AWS IAM role, user, or account root ARN")
        return value

    @field_validator("rights_timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError) as error:
            raise ValueError("Enter a valid IANA license timezone") from error
        return value

    @model_validator(mode="after")
    def validate_publication(self):
        if self.metadata_format == "none" and self.auto_publish:
            raise ValueError("Automatic publication requires a supported metadata format")
        if self.auto_publish and (not self.rights_snapshot_confirmed or self.access_type != "subscription"):
            raise ValueError("Automatic publication requires confirmed rights snapshots and the default access mode")
        return self


class DeliveryOut(BaseModel):
    id: uuid.UUID
    principal_arn: str
    bucket: str
    region: str
    prefix: str
    enabled: bool
    status: str
    error: str | None
    attempts: int
    options: dict
    last_reconciled_at: datetime | None
    delivery_uri: str = ""
    model_config = {"from_attributes": True}


class IngestOut(BaseModel):
    id: uuid.UUID
    metadata_key: str
    version_id: str
    source_modified_at: datetime
    status: str
    attempts: int
    error: str | None
    summary: dict
    completed_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class ContentPartnerCreate(BaseModel):
    delivery: DeliveryInput | None = None
    invite_account: bool = True
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
    delivery: DeliveryInput | None = None
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
    delivery: DeliveryOut | None = None
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