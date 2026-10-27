import asyncio
import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db, close_db, AsyncSessionLocal
from app.api.v1.router import api_router
from app.api.v1.admin.upload import configure_s3_cors
from app.core.scheduler import schedule_jobs
from app.core.transcode_poller import run_poller
from app.core.live_pipeline import run_live_poller
from app.core import aws_credentials

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Database AWS settings take priority over .env; must run before anything reads them.
    try:
        await aws_credentials.refresh_from_db()
    except Exception:
        logger.exception("Could not load AWS settings from the database; using .env values")
    async with AsyncSessionLocal() as session:
        await configure_s3_cors(session)

    scheduler = schedule_jobs()
    app.state.scheduler = scheduler
    poller_task = asyncio.create_task(run_poller())
    aws_refresh_task = asyncio.create_task(aws_credentials.run_refresher())
    live_poller_task = asyncio.create_task(run_live_poller())
    yield

    scheduler.shutdown(wait=False)
    for task in (poller_task, aws_refresh_task, live_poller_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    await close_db()


def _build_origin_regex() -> str | None:
    """Build the CORS origin regex from settings.

    Combines ALLOWED_ORIGINS_REGEX (explicit) with an auto-generated
    pattern for PREVIEW_BASE_DOMAIN so that every <slug>.<preview-domain>
    origin is accepted without enumerating slugs individually.
    """
    parts: list[str] = []
    if settings.ALLOWED_ORIGINS_REGEX:
        parts.append(settings.ALLOWED_ORIGINS_REGEX)
    if settings.PREVIEW_BASE_DOMAIN:
        escaped = re.escape(settings.PREVIEW_BASE_DOMAIN.lower().strip())
        parts.append(rf"https://[^./]+\.{escaped}")
    return "|".join(parts) if parts else None


app = FastAPI(
    title=settings.APP_NAME,
    description="StreamTVDepot – Multi-tenant Media SaaS Platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=_build_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME, "version": "1.0.0"}
