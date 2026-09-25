import asyncio
import logging
import uuid

from celery.exceptions import SoftTimeLimitExceeded

from app.core.celery_app import celery_app
from app.core.config import settings
from app.tasks.user_subscription_renewal import process_user_subscription_renewal_by_id

logger = logging.getLogger(__name__)

# Enforced inside the coroutine (not via Celery's signal-based soft time limit) so a hang
# (e.g. a stuck Stripe/PayPal call) is cancelled cooperatively by asyncio, letting the
# `async with AsyncSessionLocal()` block roll back and close the connection before the
# worker moves on. A signal delivered mid-await can otherwise tear down the event loop
# without ever running that cleanup, abandoning the connection as "idle in transaction".
RENEWAL_TASK_INTERNAL_TIMEOUT_SECONDS = max(settings.BILLING_TASK_TIME_LIMIT_SECONDS - 20, 30)


@celery_app.task(
    bind=True,
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=900,
    retry_jitter=True,
    max_retries=5,
    acks_late=True,
)
def process_user_subscription_renewal_task(self, subscription_id: str) -> None:
    """Run one idempotent renewal in the dedicated billing worker."""
    try:
        asyncio.run(
            asyncio.wait_for(
                process_user_subscription_renewal_by_id(uuid.UUID(subscription_id)),
                timeout=RENEWAL_TASK_INTERNAL_TIMEOUT_SECONDS,
            )
        )
    except (SoftTimeLimitExceeded, asyncio.TimeoutError) as exc:
        logger.warning("Renewal task timed out for subscription %s", subscription_id)
        raise TimeoutError(f"Renewal task timed out for subscription {subscription_id}") from exc