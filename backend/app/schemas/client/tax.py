import uuid
from datetime import datetime

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ClientTaxCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    tax_type: Literal["percentage", "flat"] = "percentage"
    percentage: float | None = Field(default=None, gt=0, le=100)
    flat_amount: float | None = Field(default=None, gt=0)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_rate(self):
        if self.tax_type == "percentage" and (self.percentage is None or self.flat_amount is not None):
            raise ValueError("Enter a percentage rate only")
        if self.tax_type == "flat" and (self.flat_amount is None or self.percentage is not None):
            raise ValueError("Enter a flat amount only")
        return self


class ClientTaxUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    percentage: float | None = Field(default=None, gt=0, le=100)
    tax_type: Literal["percentage", "flat"] | None = None
    flat_amount: float | None = Field(default=None, gt=0)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return value.strip() if value else value


class ClientTaxOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    name: str
    tax_type: Literal["percentage", "flat"]
    percentage: float
    flat_amount: float | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}