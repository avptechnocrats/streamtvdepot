import uuid
from datetime import datetime

from pydantic import BaseModel


class UUIDSchema(BaseModel):
    id: uuid.UUID


class TimestampSchema(BaseModel):
    created_at: datetime
    updated_at: datetime


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list


class MessageResponse(BaseModel):
    message: str
