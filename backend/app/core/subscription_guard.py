from datetime import datetime, timezone

from fastapi import HTTPException

from app.models.superadmin.client import ClientSubscription, SubscriptionStatus

SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE = (
    "Service is temporarily unavailable due to scheduled maintenance. "
    "For immediate assistance kindly contact support."
)

# Trial, grace-period and past-due subscriptions are still entitled to service.
_ENTITLED_STATUSES = frozenset({
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIAL,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.GRACE_PERIOD,
})


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def has_active_client_saas_subscription(subscription: ClientSubscription | None) -> bool:
    if not subscription:
        return False

    if subscription.status not in _ENTITLED_STATUSES:
        return False

    expires_at = _parse_iso_datetime(subscription.expires_at)
    if expires_at and expires_at <= datetime.now(timezone.utc):
        return False

    return True


def enforce_active_client_saas_subscription(
    subscription: ClientSubscription | None,
    detail: str = SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE,
) -> None:
    if has_active_client_saas_subscription(subscription):
        return

    raise HTTPException(
        status_code=503,
        detail={
            "code": "tenant_plan_inactive",
            "message": detail,
            "detail": detail,
        },
    )