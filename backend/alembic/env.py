import asyncio
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.config import settings
from app.models.base import Base

# Import all model modules so metadata is populated
import app.models.superadmin.admin_user  # noqa
import app.models.superadmin.client  # noqa
import app.models.superadmin.plan  # noqa
import app.models.superadmin.billing  # noqa
import app.models.superadmin.module  # noqa
import app.models.superadmin.settings  # noqa
import app.models.superadmin.demo_booking  # noqa
import app.models.client.user  # noqa
import app.models.client.content  # noqa
import app.models.client.subscription  # noqa
import app.models.client.payment  # noqa
import app.models.client.advertisement  # noqa
import app.models.client.ticket  # noqa
import app.models.client.page  # noqa
import app.models.auth.password_reset  # noqa

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
