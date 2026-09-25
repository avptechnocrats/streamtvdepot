import asyncio
import logging
import uuid

from celery.exceptions import SoftTimeLimitExceeded

from app.core.celery_app import celery_app
from app.tasks.subscription_renewal import process_client_subscription_reminder_by_id
from app.tasks.user_subscription_renewal import process_user_subscription_reminder_by_id

logger = logging.getLogger(__name__)

# See app/tasks/billing_worker.py for why this is enforced inside the coroutine rather
# than relying solely on Celery's signal-based soft_time_limit.
REMINDER_TASK_INTERNAL_TIMEOUT_SECONDS = 60


@celery_app.task(
    bind=True,
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=900,
    retry_jitter=True,
    max_retries=5,
    acks_late=True,
    soft_time_limit=75,
    time_limit=90,
)
def process_user_subscription_reminder_task(self, subscription_id: str) -> None:
    """Send one idempotently revalidated renewal reminder in a notification worker."""
    try:
        asyncio.run(
            asyncio.wait_for(
                process_user_subscription_reminder_by_id(uuid.UUID(subscription_id)),
                timeout=REMINDER_TASK_INTERNAL_TIMEOUT_SECONDS,
            )
        )
    except (SoftTimeLimitExceeded, asyncio.TimeoutError) as exc:
        logger.warning("Renewal reminder task timed out for subscription %s", subscription_id)
        raise TimeoutError(f"Renewal reminder task timed out for subscription {subscription_id}") from exc


@celery_app.task(
    bind=True,
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=900,
    retry_jitter=True,
    max_retries=5,
    acks_late=True,
    soft_time_limit=75,
    time_limit=90,
)
def process_client_subscription_reminder_task(self, client_id: str) -> None:
    """Send one revalidated tenant SaaS renewal reminder in a notification worker."""
    try:
        asyncio.run(
            asyncio.wait_for(
                process_client_subscription_reminder_by_id(uuid.UUID(client_id)),
                timeout=REMINDER_TASK_INTERNAL_TIMEOUT_SECONDS,
            )
        )
    except (SoftTimeLimitExceeded, asyncio.TimeoutError) as exc:
        logger.warning("Renewal reminder task timed out for client %s", client_id)
        raise TimeoutError(f"Renewal reminder task timed out for client {client_id}") from exc