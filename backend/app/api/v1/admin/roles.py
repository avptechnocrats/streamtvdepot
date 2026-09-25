import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_client_admin_permission_codes, get_current_client_admin, require_permissions
from app.models.client.user import ClientAdminUser, ClientPermission, ClientRole
from app.schemas.client.user import ClientPermissionOut, ClientRoleCreate, ClientRoleOut, ClientRoleUpdate

router = APIRouter()


def serialize_role(role: ClientRole, assigned_users_count: int) -> ClientRoleOut:
    return ClientRoleOut(
        id=role.id,
        client_id=role.client_id,
        name=role.name,
        description=role.description,
        is_owner_role=role.is_owner_role,
        is_system_role=role.is_system_role,
        permission_codes=sorted(permission.code for permission in role.permissions),
        assigned_users_count=assigned_users_count,
    )


async def load_permissions(db: AsyncSession, permission_codes: list[str]) -> list[ClientPermission]:
    requested_codes = set(permission_codes)
    result = await db.execute(select(ClientPermission).where(ClientPermission.code.in_(requested_codes)))
    permissions = result.scalars().all()
    if len(permissions) != len(requested_codes):
        found_codes = {permission.code for permission in permissions}
        raise HTTPException(status_code=422, detail=f"Unknown permissions: {sorted(requested_codes - found_codes)}")
    return permissions


async def load_tenant_role(db: AsyncSession, role_id: uuid.UUID, client_id: uuid.UUID) -> ClientRole:
    result = await db.execute(
        select(ClientRole)
        .options(selectinload(ClientRole.permissions))
        .where(ClientRole.id == role_id, ClientRole.client_id == client_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.get("/me/permissions", response_model=list[str])
async def get_current_permissions(
    permission_codes: set[str] = Depends(get_client_admin_permission_codes),
):
    return sorted(permission_codes)


@router.get("/permissions", response_model=list[ClientPermissionOut])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_permissions("access.roles.manage")),
):
    result = await db.execute(select(ClientPermission).order_by(ClientPermission.module, ClientPermission.code))
    return result.scalars().all()


@router.get("", response_model=list[ClientRoleOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    rows = await db.execute(
        select(ClientRole, func.count(ClientAdminUser.id))
        .outerjoin(ClientAdminUser, ClientAdminUser.role_id == ClientRole.id)
        .options(selectinload(ClientRole.permissions))
        .where(ClientRole.client_id == admin._client_id)
        .group_by(ClientRole.id)
        .order_by(ClientRole.is_owner_role.desc(), ClientRole.name)
    )
    return [serialize_role(role, count) for role, count in rows.all()]


@router.post("", response_model=ClientRoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: ClientRoleCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    if payload.name.strip().casefold() == "owner":
        raise HTTPException(status_code=403, detail="The Owner role is reserved for the registering tenant user")
    role = ClientRole(
        client_id=admin._client_id,
        name=payload.name.strip(),
        description=payload.description,
        permissions=await load_permissions(db, payload.permission_codes),
    )
    db.add(role)
    try:
        await db.flush()
    except IntegrityError as error:
        raise HTTPException(status_code=409, detail="A role with this name already exists") from error
    await db.refresh(role, ["permissions"])
    return serialize_role(role, 0)


@router.patch("/{role_id}", response_model=ClientRoleOut)
async def update_role(
    role_id: uuid.UUID,
    payload: ClientRoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    role = await load_tenant_role(db, role_id, admin._client_id)
    if role.is_owner_role:
        raise HTTPException(status_code=403, detail="The Owner role cannot be modified")
    if payload.name is not None and payload.name.strip().casefold() == "owner":
        raise HTTPException(status_code=403, detail="The Owner role is reserved for the registering tenant user")
    if payload.name is not None:
        role.name = payload.name.strip()
    if payload.description is not None:
        role.description = payload.description
    if payload.permission_codes is not None:
        role.permissions = await load_permissions(db, payload.permission_codes)
    try:
        await db.flush()
    except IntegrityError as error:
        raise HTTPException(status_code=409, detail="A role with this name already exists") from error
    return serialize_role(role, 0)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
    _=Depends(require_permissions("access.roles.manage")),
):
    role = await load_tenant_role(db, role_id, admin._client_id)
    if role.is_owner_role or role.is_system_role:
        raise HTTPException(status_code=403, detail="System roles cannot be deleted")
    assigned_users_count = await db.scalar(select(func.count(ClientAdminUser.id)).where(ClientAdminUser.role_id == role.id))
    if assigned_users_count:
        raise HTTPException(status_code=409, detail="Reassign users before deleting this role")
    await db.delete(role)