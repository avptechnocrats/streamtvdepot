import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.client.contact_submission import ContactSubmissionStatus


class ClientContactSubmissionCreate(BaseModel):
    form_data: dict[str, str | list[str]] = Field(..., min_length=1)


class ClientContactSubmissionCreateResponse(BaseModel):
    id: uuid.UUID
    message: str


class ClientContactSubmissionSummary(BaseModel):
    id: uuid.UUID
    status: ContactSubmissionStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class ClientContactSubmissionAnswer(BaseModel):
    id: str
    label: str
    type: str
    value: str | list[str] | None = None


class ClientContactSubmissionDetail(ClientContactSubmissionSummary):
    form_data: list[ClientContactSubmissionAnswer]


class ClientContactSubmissionCounts(BaseModel):
    all: int
    unread: int
    read: int
    archived: int


class ClientContactSubmissionListResponse(BaseModel):
    items: list[ClientContactSubmissionSummary]
    total: int
    page: int
    page_size: int
    counts: ClientContactSubmissionCounts
