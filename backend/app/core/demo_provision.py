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
  demo_content (series)       →  content_series          + series_categories
                                 + content_episodes  (from extra_data.episodes)
  demo_content (live_stream)  →  content_live_streams    + livestream_categories
"""
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client.content import (
    Audio,
    Category,
    ContentStatus,
    Episode,
    LiveStream,
    Series,
    Video,
    audio_categories,
    livestream_categories,
    series_categories,
    video_categories,
)
from app.models.superadmin.demo_content import DemoCategory, DemoContent


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


# ─── Main entry point ─────────────────────────────────────────────────────────

async def provision_demo_content(client_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Clone all demo categories and content items for a newly created client.
    Safe to call inside an existing transaction — flushes but does not commit.
    """
    # ── 1. Load demo data ────────────────────────────────────────────────────
    demo_cats = (await db.execute(
        select(DemoCategory).order_by(DemoCategory.sort_order)
    )).scalars().all()

    demo_items = (await db.execute(
        select(DemoContent).options(selectinload(DemoContent.categories))
    )).scalars().all()

    if not demo_cats and not demo_items:
        return  # Nothing seeded yet — skip silently

    # ── 2. Clone categories, build id-map ───────────────────────────────────
    cat_id_map: dict[uuid.UUID, uuid.UUID] = {}   # demo_cat.id → new Category.id

    for dc in demo_cats:
        new_cat = Category(
            client_id=client_id,
            name=dc.name,
            slug=dc.slug,
            description=dc.description,
            content_type=dc.content_type,
            thumbnail_url=dc.thumbnail_url,
            sort_order=dc.sort_order,
        )
        db.add(new_cat)
        await db.flush()
        cat_id_map[dc.id] = new_cat.id

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
        elif ct == "series":
            await _provision_series(client_id, item, new_cat_ids, db)
        elif ct == "live_stream":
            await _provision_live_stream(client_id, item, new_cat_ids, db)


# ─── Per-type helpers ─────────────────────────────────────────────────────────

async def _provision_video(
    client_id: uuid.UUID,
    item: DemoContent,
    cat_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    video = Video(
        client_id=client_id,
        title=item.title,
        slug=_slugify(item.title),
        short_description=item.short_description,
        long_description=item.description,
        duration=item.duration_seconds,
        video_url=item.stream_url,
        thumbnails=_thumb(item.thumbnail_url),
        age_rating=item.age_rating,
        is_featured=item.is_featured,
        is_active=True,
        access_type="free",
    )
    db.add(video)
    await db.flush()

    for cat_id in cat_ids:
        await db.execute(
            insert(video_categories).values(
                video_id=video.id, category_id=cat_id
            ).on_conflict_do_nothing()
        )


async def _provision_audio(
    client_id: uuid.UUID,
    item: DemoContent,
    cat_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    from app.models.client.content import AccessType

    audio = Audio(
        client_id=client_id,
        title=item.title,
        description=item.description,
        artist=item.artist,
        album=item.album,
        genre=item.genre,
        duration_seconds=item.duration_seconds,
        file_url=item.stream_url,
        thumbnail_url=item.thumbnail_url,
        is_featured=item.is_featured,
        access_type=AccessType.FREE,
        status=ContentStatus.PUBLISHED,
    )
    db.add(audio)
    await db.flush()

    for cat_id in cat_ids:
        await db.execute(
            insert(audio_categories).values(
                audio_id=audio.id, category_id=cat_id
            ).on_conflict_do_nothing()
        )


async def _provision_series(
    client_id: uuid.UUID,
    item: DemoContent,
    cat_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    from app.models.client.content import AccessType

    episodes_data: list[dict[str, Any]] = item.extra_data.get("episodes", [])

    series = Series(
        client_id=client_id,
        title=item.title,
        description=item.description,
        genre=item.genre,
        language=item.language,
        thumbnail_url=item.thumbnail_url,
        is_featured=item.is_featured,
        total_seasons=max((ep.get("season_number", 1) for ep in episodes_data), default=1),
        access_type=AccessType.FREE,
        status=ContentStatus.PUBLISHED,
    )
    db.add(series)
    await db.flush()

    for cat_id in cat_ids:
        await db.execute(
            insert(series_categories).values(
                series_id=series.id, category_id=cat_id
            ).on_conflict_do_nothing()
        )

    for ep in episodes_data:
        episode = Episode(
            client_id=client_id,
            series_id=series.id,
            title=ep.get("title", f"Episode {ep.get('episode_number', 1)}"),
            description=ep.get("description"),
            season_number=ep.get("season_number", 1),
            episode_number=ep.get("episode_number", 1),
            duration_seconds=ep.get("duration_seconds"),
            video_url=ep.get("stream_url"),
            thumbnail_url=ep.get("thumbnail_url"),
            status=ContentStatus.PUBLISHED,
        )
        db.add(episode)

    await db.flush()


async def _provision_live_stream(
    client_id: uuid.UUID,
    item: DemoContent,
    cat_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    stream = LiveStream(
        client_id=client_id,
        title=item.title,
        slug=_slugify(item.title),
        description=item.description,
        source=item.extra_data.get("source", "external"),
        stream_url=item.stream_url,
        thumbnails=_thumb(item.thumbnail_url),
        is_active=True,
        is_featured=item.is_featured,
        is_live=False,
        access_type="free",
    )
    db.add(stream)
    await db.flush()

    for cat_id in cat_ids:
        await db.execute(
            insert(livestream_categories).values(
                livestream_id=stream.id, category_id=cat_id
            ).on_conflict_do_nothing()
        )
