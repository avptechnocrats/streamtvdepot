from celery import Celery
from celery.signals import worker_process_init

from app.core.config import settings
from app.core.database import load_models

broker_url = settings.CELERY_BROKER_URL or settings.REDIS_URL
result_backend = settings.CELERY_RESULT_BACKEND or settings.REDIS_URL

load_models()

celery_app = Celery(
    "streamtvdepot",
    broker=broker_url,
    backend=result_backend,
    include=["app.tasks.billing_worker", "app.tasks.notification_worker"],
)

celery_app.conf.update(
    task_default_queue="default",
    task_routes={
        "app.tasks.billing_worker.*": {"queue": "billing"},
        "app.tasks.notification_worker.*": {"queue": "notifications"},
    },
    task_default_delivery_mode="persistent",
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_ignore_result=True,
    task_time_limit=max(settings.BILLING_TASK_TIME_LIMIT_SECONDS, settings.NOTIFICATION_TASK_TIME_LIMIT_SECONDS),
    task_soft_time_limit=max(
        1,
        max(settings.BILLING_TASK_TIME_LIMIT_SECONDS, settings.NOTIFICATION_TASK_TIME_LIMIT_SECONDS) - 15,
    ),
    worker_prefetch_multiplier=1,
    broker_transport_options={
        "visibility_timeout": max(
            settings.BILLING_TASK_TIME_LIMIT_SECONDS,
            settings.NOTIFICATION_TASK_TIME_LIMIT_SECONDS,
        ) * 10,
    },
    result_expires=3600,
    task_publish_retry=True,
    broker_connection_retry_on_startup=True,
)


@worker_process_init.connect
def dispose_inherited_database_pool(**_kwargs) -> None:
    """Ensure each prefork child creates its own database connections."""
    from app.core.database import engine

    engine.sync_engine.dispose(close=False)