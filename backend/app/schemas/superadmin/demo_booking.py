import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.superadmin.demo_booking import DemoBookingStatus


class DemoBookingCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    work_email: EmailStr
    company: str = Field(..., min_length=2, max_length=255)
    role: str | None = Field(None, max_length=255)
    country_region: str = Field(..., min_length=2, max_length=255)
    phone: str = Field(..., min_length=5, max_length=100)
    project_details: str = Field(..., min_length=10, max_length=5000)


class DemoBookingCreateResponse(BaseModel):
    id: uuid.UUID
    message: str
    acknowledged_email_triggered: bool


class DemoBookingReplyCreate(BaseModel):
    message: str = Field(..., min_length=2, max_length=5000)


class DemoBookingReplyOut(BaseModel):
    id: uuid.UUID
    booking_id: uuid.UUID
    author_id: uuid.UUID
    message: str
    email_sent_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DemoBookingSummary(BaseModel):
    id: uuid.UUID
    full_name: str
    work_email: str
    company: str
    status: DemoBookingStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DemoBookingDetail(BaseModel):
    id: uuid.UUID
    full_name: str
    work_email: str
    company: str
    role: str | None
    country_region: str
    phone: str
    project_details: str
    status: DemoBookingStatus
    acknowledged_email_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime
    replies: list[DemoBookingReplyOut] = []

    model_config = {"from_attributes": True}


class DemoBookingListCounts(BaseModel):
    all: int
    unread: int
    read: int
    archived: int


class DemoBookingListResponse(BaseModel):
    items: list[DemoBookingSummary]
    total: int
    page: int
    page_size: int
    counts: DemoBookingListCounts
