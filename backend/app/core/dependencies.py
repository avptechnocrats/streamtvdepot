import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_token
from app.core.subscription_guard import enforce_active_client_saas_subscription

bearer_scheme = HTTPBearer()
# Optional variant: never auto-raises on a missing/invalid Authorization header,
# so endpoints can allow anonymous access to free content while still identifying
# logged-in users for paid/subscription entitlement checks.
optional_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_superadmin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    from app.models.superadmin.admin_user import AdminUser

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("role") != "superadmin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(
        select(AdminUser).where(AdminUser.id == uuid.UUID(payload["sub"]))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_current_client_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    from app.models.client.user import ClientAdminUser

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("role") != "client_admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(
        select(ClientAdminUser).where(ClientAdminUser.id == uuid.UUID(payload["sub"]))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email to activate login.",
        )

    # Attach tenant context from token
    user._client_id = uuid.UUID(payload["client_id"])
    user._client_slug = payload.get("client_slug", "")
    return user


async def get_current_client_admin_with_active_plan(
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.models.superadmin.client import Client

    client_result = await db.execute(
        select(Client)
        .where(Client.id == admin._client_id)
        .options(selectinload(Client.subscription))
    )
    client = client_result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Platform not found")

    enforce_active_client_saas_subscription(
        client.subscription,
        detail="Services restricted. Purchase a plan to continue",
    )
    return admin


async def get_client_admin_permission_codes(
    admin=Depends(get_current_client_admin),
    db: AsyncSession = Depends(get_db),
) -> set[str]:
    """Load permissions from the database so changed roles apply immediately."""
    from app.models.client.user import AdminRole, ClientRole, client_role_permissions

    # Preserve existing owner access until the data migration assigns its Owner role.
    if admin.role == AdminRole.OWNER and admin.role_id is None:
        return {"*"}
    if admin.role_id is None:
        return set()

    role_result = await db.execute(
        select(ClientRole).where(
            ClientRole.id == admin.role_id,
            ClientRole.client_id == admin._client_id,
        )
    )
    role = role_result.scalar_one_or_none()
    if not role:
        return set()
    if role.is_owner_role:
        return {"*"}

    result = await db.execute(
        select(client_role_permissions.c.permission_code).where(
            client_role_permissions.c.role_id == role.id
        )
    )
    return set(result.scalars().all())


def require_permissions(*required_permissions: str):
    """Require every permission; the tenant Owner is the explicit full-access exception."""
    async def permission_dependency(
        permission_codes: set[str] = Depends(get_client_admin_permission_codes),
    ):
        if "*" in permission_codes:
            return
        if set(required_permissions) - permission_codes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )

    return permission_dependency


def get_required_admin_route_permission(
    path: str, method: str, plan_type: str | None = None
) -> str | None:
    """Map Client-Admin API routes to the least-privilege action permission."""
    relative_path = path.removeprefix("/api/v1/admin/")
    if relative_path == "roles/me/permissions":
        return None
    if relative_path.startswith("roles") or relative_path.startswith("users/admins"):
        return "access.roles.manage"
    if relative_path.startswith("site-settings"):
        return "settings.view" if method == "GET" else "settings.update"
    if relative_path.startswith("dashboard/reports"):
        return "reports.view"
    if relative_path.startswith("support"):
        return None
    if relative_path.startswith("users"):
        return "audience.manage"
    if relative_path.startswith("subscriptions"):
        if relative_path.startswith("subscriptions/plans"):
            module = "monetization"
        elif plan_type in {"rent", "ppv"}:
            return "audience.rent_ppv.view"
        else:
            return "audience.subscriptions.view"
    elif relative_path.startswith("tickets"):
        return "audience.tickets.manage"
    else:
        module = (
            "content" if relative_path.startswith(("content", "upload", "transcoding"))
            else "marketing" if relative_path.startswith(("advertisements", "coupons"))
            else "monetization" if relative_path.startswith(("payments", "billing", "payment-gateways", "taxes"))
            else "platform" if relative_path.startswith(("theme-settings", "pages", "menus"))
            else None
        )

    if not module:
        return None
    action = {
        "GET": "view",
        "POST": "create",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    }.get(method)
    return f"{module}.{action}" if action else None


async def enforce_admin_route_permission(
    request: Request,
    permission_codes: set[str] = Depends(get_client_admin_permission_codes),
):
    required_permission = get_required_admin_route_permission(
        request.url.path,
        request.method,
        request.query_params.get("plan_type"),
    )
    if required_permission and "*" not in permission_codes and required_permission not in permission_codes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this module",
        )


async def get_current_end_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    from app.models.client.user import EndUser
    from app.models.superadmin.client import Client

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("role") != "end_user":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(
        select(EndUser).where(EndUser.id == uuid.UUID(payload["sub"]))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    user._client_id = uuid.UUID(payload["client_id"])

    client_result = await db.execute(
        select(Client)
        .where(Client.id == user._client_id)
        .options(selectinload(Client.subscription))
    )
    client = client_result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Platform not found")

    user._client_slug = client.slug or str(user._client_id)

    enforce_active_client_saas_subscription(client.subscription)
    return user


async def get_current_end_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Resolve the end user when a valid token is present, else return None.

    Unlike get_current_end_user this never raises for anonymous or invalid
    credentials — it simply yields None so callers can permit anonymous access
    to free content while still enforcing entitlement for authenticated users.
    A present-but-unusable token (expired, wrong role, inactive user/platform)
    is treated as anonymous rather than an error.
    """
    if credentials is None:
        return None

    from app.models.client.user import EndUser
    from app.models.superadmin.client import Client

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("role") != "end_user":
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
        client_id = uuid.UUID(payload["client_id"])
    except (KeyError, ValueError, TypeError):
        return None

    user = (await db.execute(select(EndUser).where(EndUser.id == user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        return None

    client = (await db.execute(
        select(Client).where(Client.id == client_id).options(selectinload(Client.subscription))
    )).scalar_one_or_none()
    if not client or not client.is_active:
        return None

    user._client_id = client_id
    user._client_slug = client.slug or str(client_id)
    return user
