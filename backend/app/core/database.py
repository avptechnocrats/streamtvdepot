from typing import AsyncGenerator

from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine_options = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,
    # Recycle connections periodically so any that escape graceful cleanup
    # (e.g. an abrupt --reload restart) don't linger forever on the server side.
    "pool_recycle": 1800,
}
if settings.DATABASE_POOL_MODE == "null":
    engine_options["poolclass"] = NullPool
else:
    engine_options.update(
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_timeout=settings.DATABASE_POOL_TIMEOUT,
    )

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_options,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create tables and seed superadmin on first run."""
    from app.models.base import Base  # noqa – registers metadata

    load_models()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await _seed_superadmin()


async def close_db(target_engine: AsyncEngine = engine) -> None:
    """Dispose the pool so every connection is closed gracefully on process shutdown.

    Without this, a SIGTERM (e.g. from an uvicorn --reload restart) abandons the pool's
    open connections instead of closing them, and they linger server-side until the OS/DB
    keepalive eventually reaps them — silently exhausting max_connections over many reloads.
    """
    await target_engine.dispose()


def load_models() -> None:
    """Import all ORM models so SQLAlchemy relationship targets are registered."""
    import app.models.superadmin.admin_user  # noqa
    import app.models.superadmin.client  # noqa
    import app.models.superadmin.plan  # noqa
    import app.models.superadmin.billing  # noqa
    import app.models.superadmin.module  # noqa
    import app.models.superadmin.demo_booking  # noqa
    import app.models.superadmin.mail_log  # noqa
    import app.models.superadmin.scheduler_job_run  # noqa
    import app.models.client.user  # noqa
    import app.models.client.contact_submission  # noqa
    import app.models.client.content  # noqa
    import app.models.client.subscription  # noqa
    import app.models.client.payment  # noqa
    import app.models.client.advertisement  # noqa
    import app.models.auth.password_reset  # noqa


async def _seed_superadmin() -> None:
    from sqlalchemy import select

    from app.core.security import hash_password
    from app.models.superadmin.admin_user import AdminUser

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AdminUser).where(AdminUser.is_superadmin.is_(True))
        )
        if result.scalar_one_or_none():
            return

        from app.core.config import settings

        admin = AdminUser(
            email=settings.SUPERADMIN_EMAIL,
            hashed_password=hash_password(settings.SUPERADMIN_PASSWORD),
            full_name="Super Admin",
            is_superadmin=True,
            is_active=True,
        )
        session.add(admin)
        await session.commit()
