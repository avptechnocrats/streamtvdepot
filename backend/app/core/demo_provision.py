"""
Demo Content Provisioner
========================
Called once when a new client is created.  Clones all superadmin demo
categories and demo content items into the client's own content tables so they
have real, browsable sample data from day one.

Mapping:
  superadmin_demo_categories  →  content_categories
  demo_content (video)        →  content_videos          + video_categories
  demo_content (audio)        →  content_audio           + audio_categories
"""
import re
import uuid

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client.content import (
    Audio,
    Category,
    ContentStatus,
    Video,
    audio_categories,
    video_categories,
)
from app.models.superadmin.demo_content import DemoCategory, DemoContent
from app.core.storage import media_display_url


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text.strip())
    return re.sub(r"-+", "-", text).strip("-") or "item"


def _thumb(url: str | None) -> dict:
    """Convert a single thumbnail URL to the Video.thumbnails JSONB structure."""
    if not url:
        return {}
    return {"portrait": url, "landscape": url}


def _shared_asset_url(s3_key: str | None, fallback_url: str | None) -> str | None:
    """Resolve a platform-owned demo asset without copying it into a tenant."""
    if s3_key:
        return media_display_url(s3_key) or fallback_url
    return fallback_url


# ─── Main entry point ─────────────────────────────────────────────────────────

async def provision_demo_content(client_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Clone all demo categories and content items for a newly created client.
    Safe to call inside an existing transaction — flushes but does not commit.
    """
    # ── 1. Load demo data ────────────────────────────────────────────────────
    demo_cats = (await db.execute(
        select(DemoCategory)
        .where(DemoCategory.status == "published")
        .order_by(DemoCategory.sort_order)
    )).scalars().all()

    demo_items = (await db.execute(
        select(DemoContent)
        .options(selectinload(DemoContent.categories))
        .where(
            DemoContent.status == "published",
            DemoContent.content_type.in_(("video", "audio")),
        )
    )).scalars().all()

    if not demo_cats and not demo_items:
        return  # Nothing seeded yet — skip silently

    # ── 2. Reconcile categories, build id-map ───────────────────────────────
    cat_id_map: dict[uuid.UUID, uuid.UUID] = {}   # demo_cat.id → new Category.id
    existing_cats = {
        category.slug: category
        for category in (await db.execute(
            select(Category).where(
                Category.client_id == client_id,
                Category.slug.in_([category.slug for category in demo_cats]),
            )
        )).scalars().all()
    }

    for dc in demo_cats:
        category = existing_cats.get(dc.slug)
        if category:
            category.name = dc.name
            category.description = dc.description
            category.content_types = [dc.content_type] if dc.content_type else []
            category.thumbnail_url = _shared_asset_url(dc.thumbnail_s3_key, dc.thumbnail_url)
            category.sort_order = dc.sort_order
        else:
            category = Category(
                client_id=client_id,
                name=dc.name,
                slug=dc.slug,
                description=dc.description,
                content_types=[dc.content_type] if dc.content_type else [],
                thumbnail_url=_shared_asset_url(dc.thumbnail_s3_key, dc.thumbnail_url),
                sort_order=dc.sort_order,
            )
            db.add(category)
            await db.flush()
        cat_id_map[dc.id] = category.id

    # ── 3. Clone content items ───────────────────────────────────────────────
    for item in demo_items:
        new_cat_ids = [
            cat_id_map[c.id] for c in item.categories if c.id in cat_id_map
        ]
        ct = item.content_type

        if ct == "video":
            await _provision_video(client_id, item, new_cat_ids, db)
        elif ct == "audio":
            await _provision_audio(client_id, item, new_cat_ids, db)


# ─── Per-type helpers ─────────────────────────────────────────────────────────

async def _replace_category_links(
    association_table,
    owner_column: str,
    owner_id: uuid.UUID,
    category_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    await db.execute(
        delete(association_table).where(association_table.c[owner_column] == owner_id)
    )
    for category_id in category_ids:
        await db.execute(
            insert(association_table).values(
                **{owner_column: owner_id, "category_id": category_id}
            ).on_conflict_do_nothing()
        )

async def _provision_video(
    client_id: uuid.UUID,
    item: DemoContent,
    cat_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    video = (await db.execute(
        select(Video).where(Video.client_id == client_id, Video.title == item.title)
    )).scalars().first()
    if not video:
        video = Video(client_id=client_id, title=item.title, slug=_slugify(item.title))
        db.add(video)

    video.short_description = item.short_description
    video.long_description = item.description
    video.duration = item.duration_seconds
    video.video_url = _shared_asset_url(item.stream_s3_key, item.stream_url)
    video.thumbnails = _thumb(_shared_asset_url(item.thumbnail_s3_key, item.thumbnail_url))
    video.age_rating = item.age_rating
    video.is_featured = item.is_featured
    video.is_active = True
    video.status = ContentStatus.PUBLISHED
    video.access_type = "free"
    video.transcode_status = item.transcode_status
    video.transcode_progress = item.transcode_progress
    video.hls_manifest_key = item.hls_manifest_key
    video.hls_url = item.hls_url
    await db.flush()
    await _replace_category_links(video_categories, "video_id", video.id, cat_ids, db)


async def _provision_audio(
    client_id: uuid.UUID,
    item: DemoContent,
    cat_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    from app.models.client.content import AccessType

    audio = (await db.execute(
        select(Audio).where(Audio.client_id == client_id, Audio.title == item.title)
    )).scalars().first()
    if not audio:
        audio = Audio(client_id=client_id, title=item.title)
        db.add(audio)

    audio.description = item.description
    audio.artist = item.artist
    audio.album = item.album
    audio.genre = item.genre
    audio.duration_seconds = item.duration_seconds
    audio.file_url = _shared_asset_url(item.stream_s3_key, item.stream_url)
    audio.thumbnail_url = _shared_asset_url(item.thumbnail_s3_key, item.thumbnail_url)
    audio.is_featured = item.is_featured
    audio.access_type = AccessType.FREE
    audio.status = ContentStatus.PUBLISHED
    await db.flush()
    await _replace_category_links(audio_categories, "audio_id", audio.id, cat_ids, db)


