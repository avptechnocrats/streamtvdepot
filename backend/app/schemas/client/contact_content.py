from typing import Literal

from pydantic import BaseModel, Field, model_validator


ContactFieldType = Literal["text", "email", "textarea", "select", "radio", "checkbox"]


class ContactFormField(BaseModel):
    id: str = Field(..., min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9_-]*$")
    label: str = Field(..., min_length=1, max_length=255)
    type: ContactFieldType
    required: bool = False
    placeholder: str | None = Field(None, max_length=255)
    options: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_options(self):
        if self.type in {"select", "radio"} and not self.options:
            raise ValueError("Select and radio fields require at least one option.")
        if self.type not in {"select", "radio"} and self.options:
            raise ValueError("Only select and radio fields can have options.")
        return self


class FAQItem(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    answer: str = Field(..., min_length=1, max_length=10000)


class ContactContentIn(BaseModel):
    body: str | None = Field(None, max_length=100000)
    fields: list[ContactFormField] = Field(default_factory=list, max_length=50)


class FAQContentIn(BaseModel):
    body: str | None = Field(None, max_length=100000)
    items: list[FAQItem] = Field(default_factory=list, max_length=100)


class ContactContentOut(ContactContentIn):
    pass


class FAQContentOut(FAQContentIn):
    pass


class PlatformContentOut(BaseModel):
    contact: ContactContentOut
    faq: FAQContentOut