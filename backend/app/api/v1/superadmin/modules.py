import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.models.superadmin.client import ClientModule
from app.models.superadmin.module import Module
from app.schemas.superadmin.module import (
    ClientModuleToggle,
    ModuleCreate,
    ModuleOut,
    ModuleUpdate,
)

router = APIRouter()


@router.get("", response_model=list[ModuleOut])
async def list_modules(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(Module).order_by(Module.name))
    return result.scalars().all()


@router.post("", response_model=ModuleOut, status_code=status.HTTP_201_CREATED)
async def create_module(
    payload: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    module = Module(**payload.model_dump())
    db.add(module)
    await db.flush()
    await db.refresh(module)
    return module


@router.patch("/{module_id}", response_model=ModuleOut)
async def update_module(
    module_id: uuid.UUID,
    payload: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(module, field, value)
    await db.flush()
    await db.refresh(module)
    return module


@router.post("/clients/{client_id}/toggle", summary="Enable or disable a module for a client")
async def toggle_client_module(
    client_id: uuid.UUID,
    payload: ClientModuleToggle,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(ClientModule).where(
            ClientModule.client_id == client_id,
            ClientModule.module_id == payload.module_id,
        )
    )
    cm = result.scalar_one_or_none()
    if cm:
        cm.is_enabled = payload.is_enabled
    else:
        cm = ClientModule(
            client_id=client_id,
            module_id=payload.module_id,
            is_enabled=payload.is_enabled,
        )
        db.add(cm)
    await db.flush()
    return {"message": "Module updated", "is_enabled": payload.is_enabled}


@router.get("/clients/{client_id}", summary="List modules enabled for a client")
async def list_client_modules(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(ClientModule).where(ClientModule.client_id == client_id)
    )
    return result.scalars().all()
