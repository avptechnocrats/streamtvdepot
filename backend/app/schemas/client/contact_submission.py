import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.client.contact_submission import ContactSubmissionStatus


class ContactSubmissionCreate(BaseModel):
    client_slug: str | None = Field(None, min_length=1, max_length=255)
    full_name: str = Field(..., min_length=2, max_length=255)
    work_email: EmailStr
    company: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=100)
    subject: str | None = Field(None, max_length=255)
    message: str = Field(..., min_length=10, max_length=5000)


class ContactSubmissionCreateResponse(BaseModel):
    id: uuid.UUID
    message: str


class ContactSubmissionSummary(BaseModel):
    id: uuid.UUID
    full_name: str
    work_email: str
    company: str | None
    subject: str | None
    status: ContactSubmissionStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContactSubmissionDetail(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    full_name: str
    work_email: str
    company: str | None
    phone: str | None
    subject: str | None
    message: str
    status: ContactSubmissionStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContactSubmissionListCounts(BaseModel):
    all: int
    unread: int
    read: int
    archived: int


class ContactSubmissionListResponse(BaseModel):
    items: list[ContactSubmissionSummary]
    total: int
    page: int
    page_size: int
    counts: ContactSubmissionListCounts