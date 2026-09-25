import uuid
from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.superadmin.client import Client
from app.schemas.client.menus import (
    MenuGroupCreate,
    MenuGroupOut,
    MenuGroupUpdate,
    MenuLinkCreate,
    MenuLinkOut,
    MenuLinksReorderIn,
    MenuLinkUpdate,
    MenuPosition,
)

router = APIRouter()

_MENU_CONFIG_KEY = "menu_management"


def _normalize_links(raw_links: list[dict] | None) -> list[dict]:
    links = raw_links or []
    normalized: list[dict] = []
    for idx, link in enumerate(links):
        target = link.get("target")
        item_type = link.get("item_type")
        normalized_item_type = item_type if item_type in ("name", "icon") else "name"
        label = link.get("label")
        icon = link.get("icon")
        normalized.append(
            {
                "id": str(link.get("id") or uuid.uuid4()),
                "label": str(label).strip() if label else None,
                "url": str(link.get("url") or "/"),
                "sort_order": int(link.get("sort_order") or idx + 1),
                "description": link.get("description"),
                "target": target if target in ("_self", "_blank") else "_self",
                "item_type": normalized_item_type,
                "icon": str(icon).strip() if icon else None,
                "column_index": int(link.get("column_index") or 1),
            }
        )
    normalized.sort(key=lambda x: x["sort_order"])
    for idx, link in enumerate(normalized):
        link["sort_order"] = idx + 1
        if link["item_type"] == "name" and not link["label"]:
            link["label"] = "Untitled"
        if link["item_type"] == "icon" and not link["icon"]:
            link["icon"] = "CircleHelp"
        if link["column_index"] < 1:
            link["column_index"] = 1
    return normalized


def _normalize_groups(raw_groups: list[dict] | None) -> list[dict]:
    groups = raw_groups or []
    normalized: list[dict] = []
    for idx, group in enumerate(groups):
        position = group.get("position")
        footer_columns = int(group.get("footer_columns") or 1)
        if footer_columns < 1:
            footer_columns = 1
        if footer_columns > 12:
            footer_columns = 12
        normalized.append(
            {
                "id": str(group.get("id") or uuid.uuid4()),
                "name": str(group.get("name") or "Untitled Group"),
                "position": position if position in ("header", "footer") else "header",
                "is_active": bool(group.get("is_active", False)),
                "sort_order": int(group.get("sort_order") or idx + 1),
                "footer_columns": footer_columns,
                "links": _normalize_links(group.get("links") or []),
            }
        )

    normalized.sort(key=lambda x: (x["position"], x["sort_order"]))

    for position in ("header", "footer"):
        pos_groups = [g for g in normalized if g["position"] == position]
        for idx, group in enumerate(pos_groups):
            group["sort_order"] = idx + 1

        active_count = sum(1 for g in pos_groups if g["is_active"])
        if active_count > 1:
            first_active = next((g for g in pos_groups if g["is_active"]), None)
            for g in pos_groups:
                g["is_active"] = first_active is not None and g["id"] == first_active["id"]

        for group in pos_groups:
            max_col = group["footer_columns"] if group["position"] == "footer" else 1
            for link in group["links"]:
                link["column_index"] = max(1, min(int(link.get("column_index") or 1), max_col))

    return normalized


async def _get_client(client_id: uuid.UUID, db: AsyncSession) -> Client:
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


def _read_groups(client: Client) -> list[dict]:
    config = dict(client.theme_config) if client.theme_config else {}
    menu_config = config.get(_MENU_CONFIG_KEY) or {}
    raw_groups = menu_config.get("groups") or []
    return _normalize_groups(raw_groups)


async def _save_groups(client: Client, db: AsyncSession, groups: list[dict]) -> None:
    config = deepcopy(client.theme_config) if client.theme_config else {}
    config[_MENU_CONFIG_KEY] = {"groups": _normalize_groups(groups)}
    client.theme_config = config
    await db.commit()
    await db.refresh(client)


def _to_group_out(group: dict) -> MenuGroupOut:
    return MenuGroupOut(
        id=group["id"],
        name=group["name"],
        position=group["position"],
        is_active=group["is_active"],
        sort_order=group["sort_order"],
        footer_columns=group.get("footer_columns", 1),
        links=[MenuLinkOut(**link) for link in sorted(group["links"], key=lambda l: l["sort_order"])],
    )


def _find_group(groups: list[dict], group_id: str) -> tuple[int, dict]:
    for idx, group in enumerate(groups):
        if group["id"] == group_id:
            return idx, group
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu group not found")


def _find_link(group: dict, link_id: str) -> tuple[int, dict]:
    for idx, link in enumerate(group["links"]):
        if link["id"] == link_id:
            return idx, link
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu link not found")


@router.get("", response_model=list[MenuGroupOut], summary="List menu groups")
async def list_menu_groups(
    position: MenuPosition | None = Query(None, description="Optional position filter"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    if position:
        groups = [g for g in groups if g["position"] == position]
    groups.sort(key=lambda g: g["sort_order"])
    return [_to_group_out(group) for group in groups]


@router.post("/groups", response_model=MenuGroupOut, status_code=status.HTTP_201_CREATED, summary="Create menu group")
async def create_menu_group(
    payload: MenuGroupCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    pos_groups = [g for g in groups if g["position"] == payload.position]

    group = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "position": payload.position,
        "is_active": not any(g["is_active"] for g in pos_groups),
        "sort_order": len(pos_groups) + 1,
        "footer_columns": payload.footer_columns or (4 if payload.position == "footer" else 1),
        "links": [],
    }
    groups.append(group)
    await _save_groups(client, db, groups)
    return _to_group_out(group)


@router.patch("/groups/{group_id}", response_model=MenuGroupOut, summary="Update menu group")
async def update_menu_group(
    group_id: str,
    payload: MenuGroupUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    group_idx, group = _find_group(groups, group_id)

    if payload.name is not None:
        group["name"] = payload.name.strip()
    if payload.footer_columns is not None:
        group["footer_columns"] = payload.footer_columns
    groups[group_idx] = group

    await _save_groups(client, db, groups)
    return _to_group_out(group)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete menu group")
async def delete_menu_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    _, group = _find_group(groups, group_id)

    groups = [g for g in groups if g["id"] != group_id]

    if group["is_active"]:
        same_position = [g for g in groups if g["position"] == group["position"]]
        if same_position:
            same_position[0]["is_active"] = True

    await _save_groups(client, db, groups)


@router.post("/groups/{group_id}/activate", response_model=MenuGroupOut, summary="Set active menu group")
async def activate_menu_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    _, group = _find_group(groups, group_id)

    for item in groups:
        if item["position"] == group["position"]:
            item["is_active"] = item["id"] == group_id

    await _save_groups(client, db, groups)
    return _to_group_out(next(g for g in groups if g["id"] == group_id))


@router.post("/groups/{group_id}/links", response_model=MenuLinkOut, status_code=status.HTTP_201_CREATED, summary="Add link to group")
async def add_menu_link(
    group_id: str,
    payload: MenuLinkCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    group_idx, group = _find_group(groups, group_id)

    link = {
        "id": str(uuid.uuid4()),
        "label": payload.label.strip() if payload.label else None,
        "url": payload.url.strip(),
        "sort_order": len(group["links"]) + 1,
        "description": payload.description.strip() if payload.description else None,
        "target": payload.target,
        "item_type": payload.item_type,
        "icon": payload.icon.strip() if payload.icon else None,
        "column_index": payload.column_index or 1,
    }

    if link["item_type"] == "name" and not link["label"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="label is required for name menu items")
    if link["item_type"] == "icon" and not link["icon"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="icon is required for icon menu items")

    max_col = group.get("footer_columns", 1) if group["position"] == "footer" else 1
    link["column_index"] = max(1, min(link["column_index"], max_col))
    group["links"].append(link)
    groups[group_idx] = group

    await _save_groups(client, db, groups)
    return MenuLinkOut(**link)


@router.patch("/groups/{group_id}/links/{link_id}", response_model=MenuLinkOut, summary="Update link")
async def update_menu_link(
    group_id: str,
    link_id: str,
    payload: MenuLinkUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    group_idx, group = _find_group(groups, group_id)
    link_idx, link = _find_link(group, link_id)

    updates = payload.model_dump(exclude_unset=True)
    if "label" in updates and updates["label"] is not None:
        link["label"] = updates["label"].strip()
    if "url" in updates and updates["url"] is not None:
        link["url"] = updates["url"].strip()
    if "description" in updates:
        value = updates["description"]
        link["description"] = value.strip() if value else None
    if "target" in updates and updates["target"] is not None:
        link["target"] = updates["target"]
    if "item_type" in updates and updates["item_type"] is not None:
        link["item_type"] = updates["item_type"]
    if "icon" in updates:
        value = updates["icon"]
        link["icon"] = value.strip() if value else None
    if "column_index" in updates and updates["column_index"] is not None:
        link["column_index"] = updates["column_index"]

    if link.get("item_type") == "name" and not link.get("label"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="label is required for name menu items")
    if link.get("item_type") == "icon" and not link.get("icon"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="icon is required for icon menu items")

    max_col = group.get("footer_columns", 1) if group["position"] == "footer" else 1
    link["column_index"] = max(1, min(int(link.get("column_index") or 1), max_col))

    group["links"][link_idx] = link
    groups[group_idx] = group

    await _save_groups(client, db, groups)
    return MenuLinkOut(**link)


@router.delete("/groups/{group_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete link")
async def delete_menu_link(
    group_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    group_idx, group = _find_group(groups, group_id)
    _find_link(group, link_id)

    group["links"] = [item for item in group["links"] if item["id"] != link_id]
    for idx, item in enumerate(sorted(group["links"], key=lambda x: x["sort_order"])):
        item["sort_order"] = idx + 1

    groups[group_idx] = group
    await _save_groups(client, db, groups)


@router.put("/groups/{group_id}/links/reorder", response_model=list[MenuLinkOut], summary="Reorder links")
async def reorder_menu_links(
    group_id: str,
    payload: MenuLinksReorderIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    client = await _get_client(admin._client_id, db)
    groups = _read_groups(client)
    group_idx, group = _find_group(groups, group_id)

    existing_ids = {item["id"] for item in group["links"]}
    incoming_ids = payload.link_ids

    if set(incoming_ids) != existing_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="link_ids must include all and only existing link IDs for this group",
        )

    order_map = {link_id: idx + 1 for idx, link_id in enumerate(incoming_ids)}
    for link in group["links"]:
        link["sort_order"] = order_map[link["id"]]

    group["links"] = sorted(group["links"], key=lambda item: item["sort_order"])
    groups[group_idx] = group

    await _save_groups(client, db, groups)
    return [MenuLinkOut(**link) for link in group["links"]]
