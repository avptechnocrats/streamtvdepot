import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_superadmin
from app.core.demo_provision import provision_demo_content
from app.core.security import hash_password
from app.core.subscription import ensure_trial_subscription, sync_client_account_state_from_subscription
from app.models.superadmin.client import Client, ClientModule, ClientStatus, ClientSubscription, SubscriptionStatus
from app.schemas.superadmin.client import (
    ClientCreate,
    ClientOut,
    ClientSubscriptionCreate,
    ClientSubscriptionOut,
    ClientUpdate,
    CreateAdminUserPayload,
)

router = APIRouter()


def _base_client_query(search: str | None = None):
    q = select(Client)
    if search:
        q = q.where(Client.name.ilike(f"%{search}%") | Client.email.ilike(f"%{search}%"))
    return q


@router.get("/counts")
async def client_tab_counts(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    now_iso = datetime.now(timezone.utc).isoformat()

    active_q = _base_client_query(search).where(
        Client.is_active.is_(True),
        Client.status != "suspended",
        exists(
            select(ClientSubscription.id).where(
                and_(
                    ClientSubscription.client_id == Client.id,
                    ClientSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
                    (
                        (ClientSubscription.expires_at.is_(None))
                        | (ClientSubscription.expires_at >= now_iso)
                    ),
                )
            )
        ),
    )

    expired_q = _base_client_query(search).where(
        Client.is_active.is_(True),
        Client.status != "suspended",
        exists(
            select(ClientSubscription.id).where(
                and_(
                    ClientSubscription.client_id == Client.id,
                    (
                        (ClientSubscription.status == SubscriptionStatus.EXPIRED)
                        | (
                            ClientSubscription.expires_at.is_not(None)
                            & (ClientSubscription.expires_at < now_iso)
                        )
                    ),
                )
            )
        ),
    )

    archived_q = _base_client_query(search).where(
        Client.status == "inactive",
        Client.is_active.is_(False),
    )

    active_count = await db.scalar(select(func.count()).select_from(active_q.subquery()))
    expired_count = await db.scalar(select(func.count()).select_from(expired_q.subquery()))
    archived_count = await db.scalar(select(func.count()).select_from(archived_q.subquery()))

    return {
        "active": int(active_count or 0),
        "expired": int(expired_count or 0),
        "archived": int(archived_count or 0),
    }


@router.get("", response_model=list[ClientOut])
async def list_clients(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    tab: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    q = _base_client_query(search)
    now_iso = datetime.now(timezone.utc).isoformat()

    tab_value = (tab or status or "all").strip().lower()
    if tab_value == "archive":
        tab_value = "archived"

    if tab_value == "active":
        q = q.where(
            Client.is_active.is_(True),
            Client.status != "suspended",
            exists(
                select(ClientSubscription.id).where(
                    and_(
                        ClientSubscription.client_id == Client.id,
                        ClientSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
                        (
                            (ClientSubscription.expires_at.is_(None))
                            | (ClientSubscription.expires_at >= now_iso)
                        ),
                    )
                )
            ),
        )
    elif tab_value == "expired":
        q = q.where(
            Client.is_active.is_(True),
            Client.status != "suspended",
            exists(
                select(ClientSubscription.id).where(
                    and_(
                        ClientSubscription.client_id == Client.id,
                        (
                            (ClientSubscription.status == SubscriptionStatus.EXPIRED)
                            | (
                                ClientSubscription.expires_at.is_not(None)
                                & (ClientSubscription.expires_at < now_iso)
                            )
                        ),
                    )
                )
            ),
        )
    elif tab_value == "archived":
        q = q.where(
            Client.status == "inactive",
            Client.is_active.is_(False),
        )
    elif tab_value != "all":
        # Unknown tab should not silently fall back to "all".
        q = q.where(False)

    q = q.order_by(Client.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    existing = await db.execute(select(Client).where(Client.slug == payload.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already taken")

    client = Client(**payload.model_dump())
    db.add(client)
    await db.flush()
    await db.refresh(client)

    # Assign trial subscription (best-effort)
    try:
        await ensure_trial_subscription(client.id, db)
        await sync_client_account_state_from_subscription(client.id, db)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning(
            "Trial subscription skipped for client %s: %s", client.id, exc
        )

    # Best-effort: provision demo content — never block client creation
    try:
        await provision_demo_content(client.id, db)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning(
            "Demo provisioning skipped for client %s: %s", client.id, exc
        )

    return client


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(client, field, value)

    # Keep account toggles consistent for explicit status updates.
    if payload.status == ClientStatus.SUSPENDED:
        client.is_active = False
    elif payload.status in (ClientStatus.TRIAL, ClientStatus.ACTIVE) and payload.is_active is None:
        client.is_active = True

    await db.flush()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.delete(client)


@router.post("/{client_id}/provision-demo-content", status_code=status.HTTP_200_OK)
async def provision_client_demo_content(
    client_id: uuid.UUID,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    """
    Clone all demo categories and content into an existing client's tables.

    By default (force=False) this is a no-op if the client already has
    content categories — preventing accidental duplicates.
    Pass ?force=true to reprovision regardless.
    """
    from sqlalchemy import select as sa_select
    from app.models.client.content import Category

    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if not force:
        existing_cats = await db.execute(
            sa_select(Category).where(Category.client_id == client_id).limit(1)
        )
        if existing_cats.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="Client already has categories. Pass ?force=true to reprovision.",
            )

    await provision_demo_content(client_id, db)
    return {"message": f"Demo content provisioned for client '{client.name}'."}


# ─── Client Subscription Management ──────────────────────────────────────────

@router.post("/{client_id}/subscription", response_model=ClientSubscriptionOut)
async def assign_subscription(
    client_id: uuid.UUID,
    payload: ClientSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    # Remove existing subscription if any
    existing = await db.execute(
        select(ClientSubscription).where(ClientSubscription.client_id == client_id)
    )
    sub = existing.scalar_one_or_none()
    if sub:
        await db.delete(sub)

    new_sub = ClientSubscription(
        client_id=client_id,
        plan_id=payload.plan_id,
        status="active",
        started_at=payload.started_at,
        expires_at=payload.expires_at,
        auto_renew=payload.auto_renew,
    )
    db.add(new_sub)
    await db.flush()
    await sync_client_account_state_from_subscription(client_id, db)
    await db.refresh(new_sub)
    return new_sub


@router.get("/{client_id}/subscription", response_model=ClientSubscriptionOut | None)
async def get_client_subscription(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    result = await db.execute(
        select(ClientSubscription).where(ClientSubscription.client_id == client_id)
    )
    return result.scalar_one_or_none()


# ─── Client admin user creation ───────────────────────────────────────────────

@router.post("/{client_id}/admin-users", status_code=status.HTTP_201_CREATED)
async def create_client_admin(
    client_id: uuid.UUID,
    payload: CreateAdminUserPayload,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_superadmin),
):
    from app.models.client.user import ClientAdminUser

    # Verify the client exists
    result = await db.execute(select(Client).where(Client.id == client_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    # Prevent duplicate admin user for the same email + client
    from sqlalchemy import select as sa_select
    existing = await db.execute(
        sa_select(ClientAdminUser).where(
            ClientAdminUser.client_id == client_id,
            ClientAdminUser.email == payload.email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Admin user with this email already exists for this client")

    user = ClientAdminUser(
        client_id=client_id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        is_email_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return {"id": str(user.id), "email": user.email, "message": "Admin user created"}
