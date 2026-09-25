import uuid
from datetime import datetime

from pydantic import BaseModel


class ModuleCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None


class ModuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ModuleOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ClientModuleToggle(BaseModel):
    module_id: uuid.UUID
    is_enabled: bool
