#!/usr/bin/env python3
"""
Seed demo categories and content for the StreamTVDepot platform.

Categories are modelled after KalingoTV (regional Indian OTT), providing a
realistic starting library for every new client.

Run (from the backend/ directory):
    python -m scripts.seed_demo_content
    # or
    python scripts/seed_demo_content.py

The script is fully idempotent — duplicate slugs / titles are silently skipped.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.superadmin.demo_content import DemoCategory, DemoContent, demo_content_categories

# ─────────────────────────────────────────────────────────────────────────────
# CATEGORIES  (KalingoTV-style regional OTT)
# ─────────────────────────────────────────────────────────────────────────────
DEMO_CATEGORIES = [
    {"name": "Latest Movies",       "slug": "latest-movies",       "content_type": "video",       "sort_order": 1,
     "description": "New releases and blockbuster films."},
    {"name": "Web Series",          "slug": "web-series",          "content_type": "series",      "sort_order": 2,
     "description": "Binge-worthy episodic original series."},
    {"name": "Music Videos",        "slug": "music-videos",        "content_type": "video",       "sort_order": 3,
     "description": "Official music videos and lyric videos."},
    {"name": "Devotional",          "slug": "devotional",          "content_type": "video",       "sort_order": 4,
     "description": "Bhajans, kirtans, and spiritual content."},
    {"name": "Comedy",              "slug": "comedy",              "content_type": "video",       "sort_order": 5,
     "description": "Stand-up, sketches, and funny clips."},
    {"name": "News & Live TV",      "slug": "news-live-tv",        "content_type": "live_stream", "sort_order": 6,
     "description": "24×7 live news and regional channels."},
    {"name": "Kids Corner",         "slug": "kids-corner",         "content_type": "video",       "sort_order": 7,
     "description": "Safe, fun content for children."},
    {"name": "Music",               "slug": "music",               "content_type": "audio",       "sort_order": 8,
     "description": "Full songs, albums, and playlists."},
]

# ─────────────────────────────────────────────────────────────────────────────
# DEMO CONTENT
# ─────────────────────────────────────────────────────────────────────────────

_GCS = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample"
_IMG = "https://storage.googleapis.com/gtv-videos-bucket/sample/images"

DEMO_CONTENT = [
    # ── Videos ───────────────────────────────────────────────────────────────
    {
        "title": "Big Buck Bunny",
        "content_type": "video",
        "stream_url": f"{_GCS}/BigBuckBunny.mp4",
        "thumbnail_url": f"{_IMG}/BigBuckBunny.jpg",
        "short_description": "A gentle rabbit vs three tiny bullies.",
        "description": (
            "A large and lovable rabbit discovers that three tiny bullies plan to ruin his "
            "peaceful life. He decides to fight back with comical traps. Produced by the "
            "Blender Foundation. Licensed under CC BY 3.0."
        ),
        "duration_seconds": 596,
        "genre": "Animation",
        "language": "English",
        "age_rating": "U",
        "is_featured": True,
        "categories": ["latest-movies", "kids-corner", "comedy"],
    },
    {
        "title": "Elephants Dream",
        "content_type": "video",
        "stream_url": f"{_GCS}/ElephantsDream.mp4",
        "thumbnail_url": f"{_IMG}/ElephantsDream.jpg",
        "short_description": "Two characters explore a surreal mechanical world.",
        "description": (
            "The world's first open movie, produced by the Blender Foundation. Two strange "
            "characters — Proog and Emo — explore a bizarre mechanical world. Licensed CC BY 2.5."
        ),
        "duration_seconds": 653,
        "genre": "Animation",
        "language": "English",
        "age_rating": "U",
        "is_featured": False,
        "categories": ["latest-movies"],
    },
    {
        "title": "For Bigger Blazes",
        "content_type": "video",
        "stream_url": f"{_GCS}/ForBiggerBlazes.mp4",
        "thumbnail_url": f"{_IMG}/ForBiggerBlazes.jpg",
        "short_description": "High-octane action promo reel.",
        "description": "A short action-packed promotional clip — perfect for testing video playback and banner carousels.",
        "duration_seconds": 15,
        "genre": "Action",
        "language": "English",
        "age_rating": "U",
        "is_featured": False,
        "categories": ["latest-movies", "comedy"],
    },
    {
        "title": "Subaru Outback — On Street and Dirt",
        "content_type": "video",
        "stream_url": f"{_GCS}/SubaruOutbackOnStreetAndDirt.mp4",
        "thumbnail_url": f"{_IMG}/SubaruOutbackOnStreetAndDirt.jpg",
        "short_description": "An adventure-ready SUV tackling every terrain.",
        "description": "A cinematic promotional video showcasing the Subaru Outback navigating city streets and off-road trails.",
        "duration_seconds": 60,
        "genre": "Documentary",
        "language": "English",
        "age_rating": "U",
        "is_featured": False,
        "categories": ["music-videos"],
    },
    {
        "title": "Volkswagen GTI Review",
        "content_type": "video",
        "stream_url": f"{_GCS}/VolkswagenGTIReview.mp4",
        "thumbnail_url": f"{_IMG}/VolkswagenGTIReview.jpg",
        "short_description": "A dynamic road test of the iconic GTI.",
        "description": "An engaging automotive review of the Volkswagen GTI — a benchmark for video thumbnail and hero banner testing.",
        "duration_seconds": 26,
        "genre": "Documentary",
        "language": "English",
        "age_rating": "U",
        "is_featured": False,
        "categories": ["latest-movies"],
    },
    # ── Audio ─────────────────────────────────────────────────────────────────
    {
        "title": "Ambient Harmony — Track 1",
        "content_type": "audio",
        "stream_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        "thumbnail_url": None,
        "short_description": "Calming ambient background music.",
        "description": "A royalty-free ambient composition from SoundHelix. Ideal for meditation, background playlists, and testing audio playback.",
        "duration_seconds": 372,
        "genre": "Ambient",
        "language": "Instrumental",
        "artist": "SoundHelix",
        "album": "Demo Audio Collection",
        "is_featured": True,
        "categories": ["music", "devotional"],
    },
    {
        "title": "Electronic Pulse — Track 2",
        "content_type": "audio",
        "stream_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        "thumbnail_url": None,
        "short_description": "Upbeat electronic music sample.",
        "description": "A royalty-free electronic track from SoundHelix — great for action montages and modern UI testing.",
        "duration_seconds": 369,
        "genre": "Electronic",
        "language": "Instrumental",
        "artist": "SoundHelix",
        "album": "Demo Audio Collection",
        "is_featured": False,
        "categories": ["music"],
    },
    {
        "title": "Classical Reverie — Track 3",
        "content_type": "audio",
        "stream_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        "thumbnail_url": None,
        "short_description": "Gentle orchestral composition.",
        "description": "A royalty-free orchestral sample — representative of classical and devotional playlists.",
        "duration_seconds": 404,
        "genre": "Classical",
        "language": "Instrumental",
        "artist": "SoundHelix",
        "album": "Demo Audio Collection",
        "is_featured": False,
        "categories": ["music", "devotional"],
    },
    {
        "title": "Jazz Lounge — Track 7",
        "content_type": "audio",
        "stream_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
        "thumbnail_url": None,
        "short_description": "Smooth jazz lounge vibes.",
        "description": "A laid-back jazz composition from SoundHelix. Perfect for premium lounge playlists and mood-based browsing testing.",
        "duration_seconds": 217,
        "genre": "Jazz",
        "language": "Instrumental",
        "artist": "SoundHelix",
        "album": "Demo Audio Collection",
        "is_featured": False,
        "categories": ["music"],
    },
    {
        "title": "Pop Energy — Track 9",
        "content_type": "audio",
        "stream_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
        "thumbnail_url": None,
        "short_description": "Feel-good pop energy track.",
        "description": "An upbeat royalty-free pop track — ideal for trending music charts, and category banner testing.",
        "duration_seconds": 291,
        "genre": "Pop",
        "language": "Instrumental",
        "artist": "SoundHelix",
        "album": "Demo Audio Collection",
        "is_featured": False,
        "categories": ["music"],
    },
    # ── Series ────────────────────────────────────────────────────────────────
    {
        "title": "Blender Open Movies — Season 1",
        "content_type": "series",
        "stream_url": None,
        "thumbnail_url": f"{_IMG}/BigBuckBunny.jpg",
        "short_description": "A showcase of Blender Foundation's award-winning open movies.",
        "description": (
            "A curated anthology series presenting the Blender Foundation's freely licensed "
            "short films — spanning animation, sci-fi, and fantasy. Each episode is a complete "
            "short film in its own right."
        ),
        "duration_seconds": None,
        "genre": "Animation",
        "language": "English",
        "is_featured": True,
        "extra_data": {
            "episodes": [
                {
                    "title": "Big Buck Bunny",
                    "season_number": 1,
                    "episode_number": 1,
                    "stream_url": f"{_GCS}/BigBuckBunny.mp4",
                    "thumbnail_url": f"{_IMG}/BigBuckBunny.jpg",
                    "duration_seconds": 596,
                    "description": "A gentle giant rabbit vs three tiny bullies. Comedy at its finest.",
                },
                {
                    "title": "Elephants Dream",
                    "season_number": 1,
                    "episode_number": 2,
                    "stream_url": f"{_GCS}/ElephantsDream.mp4",
                    "thumbnail_url": f"{_IMG}/ElephantsDream.jpg",
                    "duration_seconds": 653,
                    "description": "Two characters traverse a surreal mechanical world in the first-ever open Blender film.",
                },
                {
                    "title": "For Bigger Blazes",
                    "season_number": 1,
                    "episode_number": 3,
                    "stream_url": f"{_GCS}/ForBiggerBlazes.mp4",
                    "thumbnail_url": f"{_IMG}/ForBiggerBlazes.jpg",
                    "duration_seconds": 15,
                    "description": "A high-energy action promo showcasing blazing speed.",
                },
            ]
        },
        "categories": ["web-series"],
    },
    # ── Live Stream ───────────────────────────────────────────────────────────
    {
        "title": "Demo Live Channel",
        "content_type": "live_stream",
        "stream_url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        "thumbnail_url": f"{_IMG}/BigBuckBunny.jpg",
        "short_description": "A 24×7 demo HLS live stream for testing.",
        "description": (
            "A publicly accessible HLS test stream hosted by Mux. Use this to verify live "
            "TV playback, channel switchers, and EPG layouts. Replace with your own channel URL when live."
        ),
        "duration_seconds": None,
        "genre": "Live TV",
        "language": "English",
        "is_featured": True,
        "extra_data": {"source": "external"},
        "categories": ["news-live-tv"],
    },
]


# ─────────────────────────────────────────────────────────────────────────────

async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # ── Categories ────────────────────────────────────────────────────────
        print("\n== Demo Categories ==")
        cat_map: dict[str, DemoCategory] = {}
        for c in DEMO_CATEGORIES:
            existing = (await db.execute(
                select(DemoCategory).where(DemoCategory.slug == c["slug"])
            )).scalar_one_or_none()

            if existing:
                print(f"  skip  {c['name']} (exists)")
                cat_map[c["slug"]] = existing
            else:
                obj = DemoCategory(**c)
                db.add(obj)
                await db.flush()
                cat_map[c["slug"]] = obj
                print(f"  add   {c['name']}")

        # ── Content ───────────────────────────────────────────────────────────
        print("\n== Demo Content ==")
        added = skipped = 0
        for item_data in DEMO_CONTENT:
            category_slugs: list[str] = item_data.pop("categories", [])

            existing = (await db.execute(
                select(DemoContent).where(DemoContent.title == item_data["title"])
            )).scalar_one_or_none()

            if existing:
                print(f"  skip  [{item_data['content_type']}] {item_data['title']} (exists)")
                skipped += 1
                # Re-attach categories in case they were added later
                item_obj = existing
            else:
                item_obj = DemoContent(**item_data)
                db.add(item_obj)
                await db.flush()
                print(f"  add   [{item_data['content_type']}] {item_data['title']}")
                added += 1

            # Sync categories (idempotent via ON CONFLICT DO NOTHING)
            for slug in category_slugs:
                cat = cat_map.get(slug)
                if cat:
                    from sqlalchemy.dialects.postgresql import insert as pg_insert
                    await db.execute(
                        pg_insert(demo_content_categories)
                        .values(demo_content_id=item_obj.id, demo_category_id=cat.id)
                        .on_conflict_do_nothing()
                    )

        await db.commit()
        print(f"\nDone — {added} content items added, {skipped} skipped.")
        print("Run 'alembic upgrade head' first if you haven't applied the migration yet.")


if __name__ == "__main__":
    asyncio.run(seed())
