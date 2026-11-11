import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field


def normalize_tag_name(value: object) -> object:
    return " ".join(value.split()) if isinstance(value, str) else value


TagName = Annotated[
    str,
    BeforeValidator(normalize_tag_name),
    Field(min_length=1, max_length=80),
]


def unique_tag_names(values: list[str]) -> list[str]:
    unique: dict[str, str] = {}
    for value in values:
        unique.setdefault(value.casefold(), value)
    return list(unique.values())


TagNames = Annotated[list[TagName], Field(max_length=100), AfterValidator(unique_tag_names)]


class ContentTagFields(BaseModel):
    tags: TagNames = Field(default_factory=list)


class TagCreate(BaseModel):
    name: TagName


class TagOut(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}