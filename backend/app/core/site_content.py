import uuid
from copy import deepcopy
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client.site_content import ClientSiteContent

ContentField = Literal["menu_management", "faq_content", "contact_content"]


async def read_site_content(client_id: uuid.UUID, db: AsyncSession, for_update: bool = False) -> dict:
    if for_update:
        await db.execute(insert(ClientSiteContent).values(id=uuid.uuid4(), client_id=client_id).on_conflict_do_nothing(index_elements=[ClientSiteContent.client_id]))
    statement = select(ClientSiteContent).where(ClientSiteContent.client_id == client_id).execution_options(populate_existing=True)
    if for_update:
        statement = statement.with_for_update()
    result = await db.execute(statement)
    content = result.scalar_one_or_none()
    return {field: deepcopy(getattr(content, field) or {}) if content else {} for field in ("menu_management", "faq_content", "contact_content")}


async def write_site_content(client_id: uuid.UUID, field: ContentField, value: dict, db: AsyncSession) -> None:
    if field not in {"menu_management", "faq_content", "contact_content"}:
        raise ValueError("Invalid site content field")
    statement = insert(ClientSiteContent).values(id=uuid.uuid4(), client_id=client_id, **{field: deepcopy(value)})
    await db.execute(statement.on_conflict_do_update(index_elements=[ClientSiteContent.client_id], set_={field: getattr(statement.excluded, field), "updated_at": func.now()}))