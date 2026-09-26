"""
Public endpoints — no authentication required.

Used by:
- Client storefronts: resolve client config by domain or slug
- Next.js middleware: determine tenant context from Host header
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote_plus
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.payment_gateways import get_active_payment_gateway_config
from app.core.subscription_guard import enforce_active_client_saas_subscription
from app.core.storage import presign_get_url
from app.core.security import create_ad_playback_token, decode_token
from app.models.superadmin.client import Client
from app.models.superadmin.plan import SaasSubscriptionPlan
from app.models.client.content import Category, ContentStatus, EPGProgram, LiveStream, PPVEvent, Video
from app.models.client.advertisement import AdEventType, AdPlacement, AdStatus, AdType, Advertisement, AdvertisementEvent
from app.models.client.content import Series, Audio
from app.models.client.subscription import ClientSubscriptionPlan
from app.models.client.page import ClientPage
from app.schemas.superadmin.client import PublicClientOut
from app.schemas.superadmin.plan import SaasPlanOut
from app.schemas.client.content import CategoryOut, EPGProgramOut, PublicLiveStreamOut, PublicPPVEventOut, PublicVideoOut, SeriesOut, AudioOut, HomeCategoryRow, HomeContentsOut, CategoryDetailOut
from app.schemas.client.subscription import ClientPlanOut
from app.schemas.client.theme_settings import ThemeSettingsOut
from app.schemas.client.site_settings import (
    GeneralSettingsOut,
    PublicSocialAuthConfigOut,
    PublicSocialAuthProviderOut,
)
from app.schemas.client.checkout import GatewayConfigOut
from app.schemas.client.page import PublicPageOut
from app.schemas.client.menus import ActiveMenusOut, MenuGroupOut, MenuLinkOut
from app.schemas.client.playback import PlaybackAdConfig, PlaybackCreative, PlaybackDecisionOut, PlaybackFallback
from app.schemas.client.contact_submission import ContactSubmissionCreate, ContactSubmissionCreateResponse
from app.schemas.client.advertisement import AdvertisementEventCreate
from app.schemas.superadmin.demo_booking import DemoBookingCreate, DemoBookingCreateResponse
from app.models.superadmin.demo_booking import DemoBookingRequest
from app.models.client.contact_submission import ContactSubmission, ContactSubmissionStatus
from app.core.system_mail import (
    get_client_notification_email,
    get_platform_notification_email,
    send_system_email,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_THEME_DEFAULTS: dict = {
    "theme_id": "dark-gold",
    "radius": "default",
    "banner_style": "static",
    "card_style": "default",
}

_MENU_CONFIG_KEY = "menu_management"


def _hls_display_url(video: Video) -> str | None:
    """
    Return the best playback URL for HLS content.

    When the video has a transcoded HLS manifest (``hls_manifest_key`` is set),
    return the backend proxy URL so the browser never hits CloudFront/S3 directly
    — this bypasses CloudFront's per-URL CORS caching that breaks multi-domain
    playback.  Falls back to a presigned S3 URL for non-transcoded videos.
    """
    if video.hls_manifest_key:
        base = settings.BACKEND_PUBLIC_URL.rstrip("/")
        prefix = settings.API_V1_PREFIX.strip("/")
        return f"{base}/{prefix}/media/stream/{video.id}/manifest.m3u8"
    # Non-HLS fallback: presign the stored S3/CloudFront URL if available
    from app.schemas.client.content import _refresh_s3_url
    return _refresh_s3_url(video.hls_url) if video.hls_url else None


def _public_video_media_urls(video: Video) -> tuple[str | None, str | None, str | None]:
    """Expose direct media URLs only for free videos; paid playback requires authorization."""
    if video.access_type != "free":
        return None, None, None
    from app.schemas.client.content import _refresh_s3_url
    return (
        video.video_url,
        _refresh_s3_url(video.video_url) if video.video_url else None,
        video.hls_url,
    )


def _normalise_strategy(value: str | None) -> str:
    strategy = (value or "").strip().lower()
    if strategy in {"hybrid", "csai", "ssai", "none"}:
        return strategy
    return "hybrid"


def _pick_csai_tag(video: Video | None) -> tuple[str | None, str | None]:
    ad_map = getattr(video, "advertisement", None) or {}
    vmap_tag = ad_map.get("vmap_tag_url") or ad_map.get("csai_vmap_tag_url")
    vast_tag = ad_map.get("vast_tag_url") or ad_map.get("csai_vast_tag_url")

    if vmap_tag:
        return str(vmap_tag), "vmap"
    if vast_tag:
        return str(vast_tag), "vast"

    if settings.AD_CSAI_DEFAULT_VMAP_TAG_URL:
        return settings.AD_CSAI_DEFAULT_VMAP_TAG_URL, "vmap"
    if settings.AD_CSAI_DEFAULT_VAST_TAG_URL:
        return settings.AD_CSAI_DEFAULT_VAST_TAG_URL, "vast"

    return None, None


def _build_ssai_url(
    stream_url: str,
    content_type: str,
    content_id: str,
    session_id: str | None,
    client_slug: str,
) -> str | None:
    if not settings.SSAI_BASE_URL:
        return None
    base = settings.SSAI_BASE_URL.rstrip("/")
    q = (
        f"stream_url={quote_plus(stream_url)}"
        f"&content_type={quote_plus(content_type)}"
        f"&content_id={quote_plus(content_id)}"
        f"&client_slug={quote_plus(client_slug)}"
    )
    if session_id:
        q += f"&session_id={quote_plus(session_id)}"
    return f"{base}?{q}"


def _make_csai_config(video: Video | None) -> PlaybackAdConfig | None:
    tag_url, tag_format = _pick_csai_tag(video)
    if not tag_url or not tag_format:
        return None
    return PlaybackAdConfig(
        tag_url=tag_url,
        format=tag_format,
        timeout_seconds=settings.AD_CSAI_TIMEOUT_SECONDS,
        show_countdown=settings.AD_CSAI_SHOW_COUNTDOWN,
    )


_EMPTY_VMAP = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0"></vmap:VMAP>'
)

# VAST-spec tracking event name -> AdEventType value
_VAST_TRACKING_EVENTS = [
    ("start", "start"),
    ("firstQuartile", "first_quartile"),
    ("midpoint", "midpoint"),
    ("thirdQuartile", "third_quartile"),
    ("complete", "complete"),
    ("skip", "skip"),
]


def _cdata_safe(value: str | None) -> str:
    """Strip the one sequence (']]>') that would break out of a CDATA section."""
    return (value or "").replace("]]>", "")


def _format_vast_offset(seconds: float) -> str:
    """Format a mid-roll cue point as a VMAP/VAST HH:MM:SS.mmm timecode."""
    total_ms = max(0, round(seconds * 1000))
    hours, rem_ms = divmod(total_ms, 3_600_000)
    minutes, rem_ms = divmod(rem_ms, 60_000)
    secs, ms = divmod(rem_ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def _format_vast_duration(seconds: int | None) -> str:
    total = max(1, int(seconds or 15))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _internal_vmap_url(video_id: uuid.UUID | str, slug: str, session_id: str, tracking_token: str) -> str:
    base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    prefix = settings.API_V1_PREFIX.strip("/")
    return (
        f"{base}/{prefix}/public/playback/video/{video_id}/vmap.xml"
        f"?slug={quote_plus(slug)}&session_id={quote_plus(session_id)}&tt={quote_plus(tracking_token)}"
    )


def _ad_beacon_url(
    video_id: uuid.UUID | str,
    ad_id: str,
    beacon_event: str,
    placement_type: str,
    session_id: str,
    break_key: str,
    tracking_token: str,
) -> str:
    """GET tracking pixel the IMA SDK fires directly — VAST trackers cannot send a JSON body."""
    base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    prefix = settings.API_V1_PREFIX.strip("/")
    query = (
        f"event={quote_plus(beacon_event)}"
        f"&session_id={quote_plus(session_id)}"
        f"&content_id={quote_plus(str(video_id))}"
        f"&placement_type={quote_plus(placement_type)}"
        f"&break_key={quote_plus(break_key)}"
        f"&tt={quote_plus(tracking_token)}"
    )
    return f"{base}/{prefix}/public/ads/{ad_id}/beacon?{query}"


def _build_vmap_xml(
    video_id: uuid.UUID | str,
    ads: list[PlaybackCreative],
    session_id: str,
    tracking_token: str,
) -> str:
    """
    Render a VMAP 1.0 document (inline VAST 3.0 per break) from resolved pre/mid/post-roll
    creatives, so the existing IMA3 CSAI pipeline schedules/plays them exactly like a
    manually-configured VMAP tag would — same pause/resume/skip/tracking behaviour.
    """
    playable = [ad for ad in ads if ad.media_url and ad.duration_seconds]
    if not playable:
        return _EMPTY_VMAP

    # Ads sharing the same slot + cue point become one ad break (a pod, played back-to-back)
    pods: dict[tuple[str, float | None], list[PlaybackCreative]] = {}
    for ad in playable:
        pods.setdefault((ad.placement_type, ad.at_seconds), []).append(ad)

    breaks: list[str] = []
    for (slot, at_seconds), pod in pods.items():
        if slot == "pre_roll":
            time_offset = "start"
        elif slot == "post_roll":
            time_offset = "end"
        else:
            time_offset = _format_vast_offset(at_seconds or 0.0)

        ads_xml: list[str] = []
        for ad in pod:
            tracking_events = "".join(
                f'<Tracking event="{vast_evt}"><![CDATA[{_ad_beacon_url(video_id, ad.advertisement_id, beacon_evt, slot, session_id, ad.break_key, tracking_token)}]]></Tracking>'
                for vast_evt, beacon_evt in _VAST_TRACKING_EVENTS
            )
            impression_url = _ad_beacon_url(video_id, ad.advertisement_id, "impression", slot, session_id, ad.break_key, tracking_token)
            click_tracking_url = _ad_beacon_url(video_id, ad.advertisement_id, "click", slot, session_id, ad.break_key, tracking_token)
            click_through = (
                f"<ClickThrough><![CDATA[{_cdata_safe(ad.click_through_url)}]]></ClickThrough>"
                if ad.click_through_url
                else ""
            )
            skip_attr = ' skipoffset="00:00:05"' if ad.is_skippable else ""
            ads_xml.append(f"""
        <Ad id="{xml_escape(ad.advertisement_id)}">
          <InLine>
            <AdSystem>StreamTVDepot</AdSystem>
            <AdTitle><![CDATA[{_cdata_safe(ad.title)}]]></AdTitle>
            <Impression><![CDATA[{impression_url}]]></Impression>
            <Creatives>
              <Creative>
                <Linear{skip_attr}>
                  <Duration>{_format_vast_duration(ad.duration_seconds)}</Duration>
                  <TrackingEvents>{tracking_events}</TrackingEvents>
                  <VideoClicks>
                    {click_through}
                    <ClickTracking><![CDATA[{click_tracking_url}]]></ClickTracking>
                  </VideoClicks>
                  <MediaFiles>
                    <MediaFile delivery="progressive" type="video/mp4" width="1280" height="720" scalable="true" maintainAspectRatio="true"><![CDATA[{_cdata_safe(ad.media_url)}]]></MediaFile>
                  </MediaFiles>
                </Linear>
              </Creative>
            </Creatives>
          </InLine>
        </Ad>""")

        break_id = xml_escape(f"{slot}-{0 if at_seconds is None else int(at_seconds)}")
        breaks.append(f"""
  <vmap:AdBreak timeOffset="{time_offset}" breakType="linear" breakId="{break_id}">
    <vmap:AdSource id="{break_id}-src" allowMultipleAds="true" followRedirects="true">
      <vmap:VASTAdData>
        <VAST version="3.0">{''.join(ads_xml)}
        </VAST>
      </vmap:VASTAdData>
    </vmap:AdSource>
  </vmap:AdBreak>""")

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0">'
        + "".join(breaks)
        + "\n</vmap:VMAP>"
    )


async def _resolve_video_creatives(
    video: Video,
    client_id: uuid.UUID,
    db: AsyncSession,
) -> list[PlaybackCreative]:
    now = datetime.now(timezone.utc)
    spend = (
        select(
            AdvertisementEvent.advertisement_id.label("ad_id"),
            func.coalesce(func.sum(AdvertisementEvent.billable_amount), 0).label("spend"),
        )
        .group_by(AdvertisementEvent.advertisement_id)
        .subquery()
    )
    result = await db.execute(
        select(Advertisement, AdPlacement)
        .join(AdPlacement, AdPlacement.ad_id == Advertisement.id)
        .outerjoin(spend, spend.c.ad_id == Advertisement.id)
        .where(
            Advertisement.client_id == client_id,
            Advertisement.status == AdStatus.ACTIVE,
            Advertisement.media_url.is_not(None),
            or_(Advertisement.starts_at.is_(None), Advertisement.starts_at <= now),
            or_(Advertisement.ends_at.is_(None), Advertisement.ends_at > now),
            or_(Advertisement.budget.is_(None), func.coalesce(spend.c.spend, 0) < Advertisement.budget),
            AdPlacement.client_id == client_id,
            AdPlacement.is_active.is_(True),
            or_(AdPlacement.content_type.is_(None), AdPlacement.content_type.in_(["video", "all"])),
            or_(AdPlacement.content_id.is_(None), AdPlacement.content_id == str(video.id)),
        )
        .order_by(AdPlacement.priority.desc(), Advertisement.created_at.asc())
    )
    candidates = result.all()
    ad_map = video.advertisement or {}
    explicit = {
        "pre_roll": ad_map.get("pre_ad_id"),
        "post_roll": ad_map.get("post_ad_id"),
        "mid_roll": ad_map.get("mid_category_ad_id"),
    }
    mid_times = [
        float(item["at_seconds"])
        for item in ad_map.get("ad_breaks", [])
        if item.get("position") == "mid" and item.get("at_seconds") is not None
    ]
    if not mid_times and ad_map.get("mid_ad_sequence_time") is not None:
        mid_times = [float(ad_map["mid_ad_sequence_time"])]

    selected: list[PlaybackCreative] = []
    used_slots: set[str] = set()
    for ad, placement in candidates:
        slot = placement.placement_type
        if explicit.get(slot) and str(ad.id) != str(explicit[slot]):
            continue
        if slot in {"pre_roll", "mid_roll", "post_roll"} and ad.ad_type != AdType.VIDEO:
            continue
        if slot in {"overlay", "banner", "sidebar"} and ad.ad_type == AdType.VIDEO:
            continue
        if slot != "mid_roll" and slot in used_slots:
            continue
        times = mid_times if slot == "mid_roll" else [None]
        if slot == "mid_roll" and not times:
            continue
        for at_seconds in times:
            selected.append(PlaybackCreative(
                advertisement_id=str(ad.id),
                title=ad.title,
                ad_type=ad.ad_type.value,
                media_url=ad.media_url,
                click_through_url=ad.click_through_url,
                duration_seconds=ad.duration_seconds,
                is_skippable=ad.is_skippable,
                placement_type=slot,
                at_seconds=at_seconds,
                break_key=f"{ad.id}:{slot}:{'' if at_seconds is None else at_seconds}",
            ))
        used_slots.add(slot)

    # Cue-point ads: an explicit (any ad_type) pin to an exact video timestamp, independent of
    # AdPlacement targeting. Video-type cue ads join the mid_roll pod (same VMAP/IMA3 pipeline);
    # non-video cue ads get placement_type "cue" so the player shows/hides them by currentTime.
    cue_points = ad_map.get("cue_points", []) or []
    cue_ad_ids = {str(item["advertisement_id"]) for item in cue_points if item.get("advertisement_id")}
    if cue_ad_ids:
        cue_result = await db.execute(
            select(Advertisement, spend.c.spend)
            .outerjoin(spend, spend.c.ad_id == Advertisement.id)
            .where(
                Advertisement.id.in_([uuid.UUID(x) for x in cue_ad_ids]),
                Advertisement.client_id == client_id,
                Advertisement.status == AdStatus.ACTIVE,
                Advertisement.media_url.is_not(None),
                or_(Advertisement.starts_at.is_(None), Advertisement.starts_at <= now),
                or_(Advertisement.ends_at.is_(None), Advertisement.ends_at > now),
                or_(Advertisement.budget.is_(None), func.coalesce(spend.c.spend, 0) < Advertisement.budget),
            )
        )
        cue_ads_by_id = {str(row[0].id): row[0] for row in cue_result.all()}
        for item in cue_points:
            ad = cue_ads_by_id.get(str(item.get("advertisement_id")))
            at_seconds = item.get("at_seconds")
            if not ad or at_seconds is None:
                continue
            slot = "mid_roll" if ad.ad_type == AdType.VIDEO else "cue"
            selected.append(PlaybackCreative(
                advertisement_id=str(ad.id),
                title=ad.title,
                ad_type=ad.ad_type.value,
                media_url=ad.media_url,
                click_through_url=ad.click_through_url,
                duration_seconds=ad.duration_seconds,
                is_skippable=ad.is_skippable,
                placement_type=slot,
                at_seconds=float(at_seconds),
                break_key=f"{ad.id}:{slot}:{at_seconds}",
            ))

    return selected


async def _resolve_client(slug: str, db: AsyncSession, enforce_plan: bool = True) -> Client:
    result = await db.execute(
        select(Client)
        .where(Client.slug == slug)
        .options(selectinload(Client.subscription))
    )
    client = result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=404, detail="Platform not found.")
    if enforce_plan:
        enforce_active_client_saas_subscription(client.subscription)
    return client


def _normalize_public_menu_groups(raw_groups: list[dict] | None) -> list[dict]:
    groups = raw_groups or []
    normalized: list[dict] = []
    for group in groups:
        position = group.get("position")
        if position not in ("header", "footer"):
            continue

        raw_links = group.get("links") or []
        links: list[dict] = []
        for idx, link in enumerate(raw_links):
            target = link.get("target")
            item_type = link.get("item_type")
            links.append(
                {
                    "id": str(link.get("id") or ""),
                    "label": str(link.get("label") or "Untitled") if link.get("label") else None,
                    "url": str(link.get("url") or "/"),
                    "sort_order": int(link.get("sort_order") or idx + 1),
                    "description": link.get("description"),
                    "target": target if target in ("_self", "_blank") else "_self",
                    "item_type": item_type if item_type in ("name", "icon") else "name",
                    "icon": str(link.get("icon")) if link.get("icon") else None,
                    "column_index": int(link.get("column_index") or 1),
                }
            )

        links.sort(key=lambda x: x["sort_order"])
        for idx, link in enumerate(links):
            link["sort_order"] = idx + 1

        normalized.append(
            {
                "id": str(group.get("id") or ""),
                "name": str(group.get("name") or "Untitled Group"),
                "position": position,
                "is_active": bool(group.get("is_active", False)),
                "sort_order": int(group.get("sort_order") or 1),
                "footer_columns": int(group.get("footer_columns") or 1),
                "links": links,
            }
        )

    normalized.sort(key=lambda x: (x["position"], x["sort_order"]))
    return normalized


def _to_menu_group_out(group: dict) -> MenuGroupOut:
    return MenuGroupOut(
        id=group["id"],
        name=group["name"],
        position=group["position"],
        is_active=group["is_active"],
        sort_order=group["sort_order"],
        footer_columns=max(1, int(group.get("footer_columns") or 1)),
        links=[MenuLinkOut(**link) for link in group["links"]],
    )


@router.get(
    "/client",
    response_model=PublicClientOut,
    summary="Resolve a client by domain or slug — used by storefronts and middleware",
)
async def get_public_client(
    domain: str | None = Query(None, description="Custom domain, e.g. 'kalingo.tv'"),
    slug: str | None = Query(None, description="Platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    if not domain and not slug:
        raise HTTPException(status_code=400, detail="Provide either 'domain' or 'slug'.")

    if domain:
        result = await db.execute(select(Client).where(Client.domain == domain))
    else:
        result = await db.execute(select(Client).where(Client.slug == slug))

    client = result.scalar_one_or_none()
    if not client or not client.is_active:
        raise HTTPException(status_code=404, detail="Platform not found.")

    return client


@router.get(
    "/plans",
    response_model=list[SaasPlanOut],
    summary="List all active SaaS plans — used by the public pricing page",
)
async def list_public_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SaasSubscriptionPlan)
        .where(
            SaasSubscriptionPlan.deleted_at.is_(None),
            SaasSubscriptionPlan.is_active.is_(True),
            SaasSubscriptionPlan.is_trial.is_(False),
        )
        .order_by(SaasSubscriptionPlan.price_monthly)
    )
    return result.scalars().all()


@router.get(
    "/theme-settings",
    response_model=ThemeSettingsOut,
    summary="Get theme settings for a client storefront — no auth required",
)
async def get_public_theme_settings(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db, enforce_plan=False)
    config: dict = client.theme_config or {}
    return ThemeSettingsOut(
        theme_id=config.get("theme_id", _THEME_DEFAULTS["theme_id"]),
        radius=config.get("radius", _THEME_DEFAULTS["radius"]),
        banner_style=config.get("banner_style", _THEME_DEFAULTS["banner_style"]),
        card_style=config.get("card_style", _THEME_DEFAULTS["card_style"]),
    )


@router.get(
    "/site-settings",
    response_model=GeneralSettingsOut,
    summary="Get public site settings (logo, title, tagline, language) — no auth required",
)
async def get_public_site_settings(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db, enforce_plan=False)
    cfg: dict = client.site_config or {}
    logo_s3_key: str | None = cfg.get("logo_s3_key")
    favicon_s3_key: str | None = cfg.get("favicon_s3_key")
    logo_url: str | None = None
    if logo_s3_key:
        logo_url = presign_get_url(logo_s3_key, inline=True)
    favicon_url = presign_get_url(favicon_s3_key, inline=True) if favicon_s3_key else None
    return GeneralSettingsOut(
        site_title=cfg.get("site_title"),
        tagline=cfg.get("tagline"),
        site_language=cfg.get("site_language"),
        logo_s3_key=logo_s3_key,
        logo_url=logo_url,
        favicon_s3_key=favicon_s3_key,
        favicon_url=favicon_url,
    )


@router.get(
    "/auth/config/social-auth",
    response_model=PublicSocialAuthConfigOut,
    summary="Get social sign-in providers for a client storefront",
)
async def get_public_social_auth_config(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db, enforce_plan=False)
    social_auth: dict = (client.site_config or {}).get("social_auth") or {}
    google: dict = social_auth.get("google") or {}
    enabled = bool(google.get("enabled"))

    return PublicSocialAuthConfigOut(
        google=PublicSocialAuthProviderOut(
            enabled=enabled,
            client_id=google.get("client_id") if enabled else None,
            redirect_uri=google.get("redirect_uri") if enabled else None,
        )
    )


@router.get(
    "/menus/active",
    response_model=ActiveMenusOut,
    summary="Get active header/footer menus for a client storefront — no auth required",
)
async def get_public_active_menus(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db, enforce_plan=False)
    config: dict = client.theme_config or {}
    menu_config: dict = config.get(_MENU_CONFIG_KEY) or {}
    groups = _normalize_public_menu_groups(menu_config.get("groups") or [])

    active_header = next((g for g in groups if g["position"] == "header" and g["is_active"]), None)
    active_footer = next((g for g in groups if g["position"] == "footer" and g["is_active"]), None)

    return ActiveMenusOut(
        header=_to_menu_group_out(active_header) if active_header else None,
        footer=_to_menu_group_out(active_footer) if active_footer else None,
    )


@router.get(
    "/checkout-config",
    response_model=GatewayConfigOut,
    summary="Return which payment gateways are enabled + Stripe publishable key — no auth required",
)
async def get_checkout_config(
    slug: str = Query(..., description="Client platform slug"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)
    stripe_cfg = get_active_payment_gateway_config(client.site_config, "stripe")
    paypal_cfg = get_active_payment_gateway_config(client.site_config, "paypal")
    razorpay_cfg = get_active_payment_gateway_config(client.site_config, "razorpay")
    cashfree_cfg = get_active_payment_gateway_config(client.site_config, "cashfree")
    gateways = (client.site_config or {}).get("payment_gateways", {})
    default_gateway = gateways.get("default_gateway") if isinstance(gateways, dict) else None
    return GatewayConfigOut(
        stripe_enabled=bool(stripe_cfg.get("enabled", False)),
        paypal_enabled=bool(paypal_cfg.get("enabled", False)),
        razorpay_enabled=bool(razorpay_cfg.get("enabled", False)),
        cashfree_enabled=bool(cashfree_cfg.get("enabled", False)),
        default_gateway=default_gateway if default_gateway in {"stripe", "paypal", "razorpay", "cashfree"} else None,
        stripe_publishable_key=stripe_cfg.get("publishable_key") if stripe_cfg.get("enabled") else None,
        razorpay_key_id=razorpay_cfg.get("key_id") if razorpay_cfg.get("enabled") else None,
        cashfree_mode=cashfree_cfg.get("mode") if cashfree_cfg.get("enabled") else None,
    )


@router.get(
    "/subscription-plans",
    response_model=list[ClientPlanOut],
    summary="List active subscription plans for a client storefront — no auth required",
)
async def list_public_subscription_plans(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    plan_type: str | None = Query(None, description="Filter by plan type (subscription|rent|ppv)"),
    content_id: uuid.UUID | None = Query(None, description="Filter content-specific plans"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)

    configured_plan_ids: set[str] | None = None
    if content_id is not None:
        content_result = await db.execute(
            select(Video.subscription_plan_ids).where(
                Video.id == content_id,
                Video.client_id == client.id,
                Video.deleted_at.is_(None),
                Video.is_active.is_(True),
            )
        )
        configured_ids = content_result.scalar_one_or_none()
        configured_plan_ids = {str(plan_id) for plan_id in (configured_ids or [])}

    result = await db.execute(
        select(ClientSubscriptionPlan)
        .where(
            ClientSubscriptionPlan.client_id == client.id,
            ClientSubscriptionPlan.is_active.is_(True),
            ClientSubscriptionPlan.plan_type == plan_type if plan_type else True,
        )
        .order_by(ClientSubscriptionPlan.sort_order, ClientSubscriptionPlan.price)
    )
    plans = result.scalars().all()
    if configured_plan_ids is not None:
        plans = [plan for plan in plans if str(plan.id) in configured_plan_ids]
    return plans


@router.get(
    "/categories",
    response_model=list[CategoryOut],
    summary="List content categories for a client storefront — no auth required",
)
async def list_public_categories(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    content_type: str | None = Query(None, description="Filter by content type (video|livestream|series|channel|audio)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)

    q = select(Category).where(Category.client_id == client.id)
    if content_type:
        q = q.where(Category.content_types.contains([content_type]))
    q = q.order_by(Category.sort_order, Category.name).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(q)
    categories = result.scalars().all()
    
    # Populate presigned display URLs for thumbnail and banner
    from app.schemas.client.content import _refresh_s3_url
    category_outs = []
    for cat in categories:
        cat_dict = {
            "id": cat.id,
            "client_id": cat.client_id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "is_parent": cat.is_parent,
            "parent_id": cat.parent_id,
            "thumbnail_asset_id": cat.thumbnail_asset_id,
            "thumbnail_url": cat.thumbnail_url,
            "thumbnail_display_url": _refresh_s3_url(cat.thumbnail_url) if cat.thumbnail_url else None,
            "banner_asset_id": cat.banner_asset_id,
            "banner_url": cat.banner_url,
            "banner_display_url": _refresh_s3_url(cat.banner_url) if cat.banner_url else None,
            "sort_order": cat.sort_order,
            "content_types": cat.content_types,
            "created_at": cat.created_at,
            "updated_at": cat.updated_at,
        }
        category_outs.append(CategoryOut(**cat_dict))
    
    return category_outs


@router.get(
    "/categories/{category_slug}",
    response_model=CategoryDetailOut,
    summary="Get category details with paginated content items — no auth required",
)
async def get_public_category_detail(
    category_slug: str,
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a single category's details along with all its paginated content items
    from all content types (videos, series, livestreams, audio).
    """
    client = await _resolve_client(slug, db)

    # Fetch the category
    result = await db.execute(
        select(Category).where(
            Category.client_id == client.id,
            Category.slug == category_slug,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    # Build category output with display URLs
    from app.schemas.client.content import _refresh_s3_url
    cat_dict = {
        "id": category.id,
        "client_id": category.client_id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "is_parent": category.is_parent,
        "parent_id": category.parent_id,
        "thumbnail_asset_id": category.thumbnail_asset_id,
        "thumbnail_url": category.thumbnail_url,
        "thumbnail_display_url": _refresh_s3_url(category.thumbnail_url) if category.thumbnail_url else None,
        "banner_asset_id": category.banner_asset_id,
        "banner_url": category.banner_url,
        "banner_display_url": _refresh_s3_url(category.banner_url) if category.banner_url else None,
        "sort_order": category.sort_order,
        "content_types": category.content_types,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }
    category_out = CategoryOut(**cat_dict)

    # Fetch paginated content from all types
    all_items = []
    total_items = 0

    # Videos
    videos_result = await db.execute(
        select(Video)
        .join(Video.categories)
        .where(
            Video.client_id == client.id,
            Category.id == category.id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
            Video.status == ContentStatus.PUBLISHED,
        )
        .order_by(Video.created_at.desc())
    )
    videos = [PublicVideoOut.model_validate(v) for v in videos_result.scalars().all()]
    total_items += len(videos)
    all_items.extend(videos)

    # Series
    series_result = await db.execute(
        select(Series)
        .join(Series.categories)
        .where(
            Series.client_id == client.id,
            Category.id == category.id,
            Series.status == "published",
        )
        .order_by(Series.created_at.desc())
    )
    series_list = [SeriesOut.model_validate(s) for s in series_result.scalars().all()]
    total_items += len(series_list)
    all_items.extend(series_list)

    # Live Streams
    livestreams_result = await db.execute(
        select(LiveStream)
        .join(LiveStream.categories)
        .where(
            LiveStream.client_id == client.id,
            Category.id == category.id,
            LiveStream.is_active.is_(True),
        )
        .order_by(LiveStream.created_at.desc())
    )
    livestreams = [PublicLiveStreamOut.model_validate(ls) for ls in livestreams_result.scalars().all()]
    total_items += len(livestreams)
    all_items.extend(livestreams)

    # Audio
    audio_result = await db.execute(
        select(Audio)
        .join(Audio.categories)
        .where(
            Audio.client_id == client.id,
            Category.id == category.id,
            Audio.status == "published",
        )
        .order_by(Audio.created_at.desc())
    )
    audio_list = [AudioOut.model_validate(a) for a in audio_result.scalars().all()]
    total_items += len(audio_list)
    all_items.extend(audio_list)

    # Sort all items by created_at descending
    all_items.sort(key=lambda x: x.created_at, reverse=True)

    # Paginate
    offset = (page - 1) * page_size
    paginated_items = all_items[offset : offset + page_size]
    has_more = len(all_items) > offset + page_size

    return CategoryDetailOut(
        category=category_out,
        items=paginated_items,
        page=page,
        page_size=page_size,
        total_items=total_items,
        has_more=has_more,
    )


@router.get(
    "/videos",
    response_model=list[PublicVideoOut],
    summary="List public videos for a client storefront — no auth required",
)
async def list_public_videos(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    is_slider: bool | None = Query(None, description="Filter to slider/banner videos"),
    is_featured: bool | None = Query(None, description="Filter to featured videos"),
    category: str | None = Query(None, description="Filter by category name"),
    search: str | None = Query(None, description="Search by title"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)

    q = (
        select(Video)
        .where(
            Video.client_id == client.id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
            Video.status == ContentStatus.PUBLISHED,
        )
    )
    if is_slider is not None:
        q = q.where(Video.is_slider.is_(is_slider))
    if is_featured is not None:
        q = q.where(Video.is_featured.is_(is_featured))
    if category:
        q = q.join(Video.categories).where(Category.slug == category)
    if search:
        q = q.where(Video.title.ilike(f"%{search}%"))
    q = q.order_by(Video.created_at.desc()).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(q)
    videos = result.scalars().all()
    
    # Populate presigned display URLs for each video
    from app.schemas.client.content import _refresh_s3_url
    video_outs = []
    for video in videos:
        video_url, video_display_url, hls_url = _public_video_media_urls(video)
        video_dict = {
            "id": video.id,
            "title": video.title,
            "slug": video.slug,
            "short_description": video.short_description,
            "long_description": video.long_description,
            "categories": video.categories,
            "age_rating": video.age_rating,
            "content_classification": video.content_classification,
            "language": video.language or [],
            "rating": video.rating,
            "duration": video.duration,
            "cast_crew": video.cast_crew or [],
            "related_video_ids": video.related_video_ids or [],
            "is_featured": video.is_featured,
            "is_active": video.is_active,
            "is_slider": video.is_slider,
            "video_url": video_url,
            "video_display_url": video_display_url,
            "hls_url": hls_url,
            "hls_display_url": _hls_display_url(video),
            "thumbnails": video.thumbnails or {},
            "trailer_type": video.trailer_type,
            "trailer_url": video.trailer_url,
            "access_type": video.access_type,
            "subscription_plan_ids": video.subscription_plan_ids or [],
            "ppv_price": video.ppv_price,
            "publish_at": video.publish_at,
            "created_at": video.created_at,
            "updated_at": video.updated_at,
        }
        video_outs.append(PublicVideoOut(**video_dict))
    
    return video_outs


@router.get(
    "/video/{video_id}",
    response_model=PublicVideoOut,
    summary="Get a single public video by ID — no auth required",
)
async def get_public_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")
    
    video_url, video_display_url, hls_url = _public_video_media_urls(video)
    video_dict = {
        "id": video.id,
        "title": video.title,
        "slug": video.slug,
        "short_description": video.short_description,
        "long_description": video.long_description,
        "categories": video.categories,
        "age_rating": video.age_rating,
        "content_classification": video.content_classification,
        "language": video.language or [],
        "rating": video.rating,
        "duration": video.duration,
        "cast_crew": video.cast_crew or [],
        "related_video_ids": video.related_video_ids or [],
        "is_featured": video.is_featured,
        "is_active": video.is_active,
        "is_slider": video.is_slider,
        "video_url": video_url,
        "video_display_url": video_display_url,
        "hls_url": hls_url,
        "hls_display_url": _hls_display_url(video),
        "thumbnails": video.thumbnails or {},
        "trailer_type": video.trailer_type,
        "trailer_url": video.trailer_url,
        "access_type": video.access_type,
        "subscription_plan_ids": video.subscription_plan_ids or [],
        "ppv_price": video.ppv_price,
        "publish_at": video.publish_at,
        "created_at": video.created_at,
        "updated_at": video.updated_at,
    }
    return PublicVideoOut(**video_dict)


@router.get(
    "/playback/video/{video_id}",
    response_model=PlaybackDecisionOut,
    summary="Resolve hybrid playback strategy for video (SSAI preferred + CSAI fallback)",
)
async def resolve_video_playback(
    video_id: str,
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    session_id: str | None = Query(None, description="Opaque playback session ID for ad tracking"),
    strategy: str | None = Query(
        None,
        description="Override strategy: hybrid|csai|ssai|none (defaults to server policy)",
    ),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)

    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.client_id == client.id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
            Video.status == ContentStatus.PUBLISHED,
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found.")

    ad_map = video.advertisement or {}
    chosen_strategy = _normalise_strategy(ad_map.get("ad_mode") or settings.AD_HYBRID_DEFAULT_MODE)
    playback_url = _hls_display_url(video) or video.video_url
    creatives = await _resolve_video_creatives(video, client.id, db)
    resolved_session_id = session_id or str(uuid.uuid4())
    tracking_token = create_ad_playback_token(
        str(video.id),
        {
            "client_id": str(client.id),
            "session_id": resolved_session_id,
            "content_type": "video",
            "advertisement_ids": [item.advertisement_id for item in creatives],
        },
    ) if creatives else None

    # Manual VMAP/VAST tag (external ad server) always takes priority. Otherwise, if the
    # Pre-roll/Post-roll/Mid-roll Ad IDs or Ad Break Scheduler resolved any video creatives,
    # generate our own VMAP so IMA3 schedules/plays them exactly like a manual tag would.
    csai_config = _make_csai_config(video)
    if csai_config is None:
        video_ads = [item for item in creatives if item.ad_type == "video"]
        if video_ads and tracking_token:
            csai_config = PlaybackAdConfig(
                tag_url=_internal_vmap_url(video.id, slug, resolved_session_id, tracking_token),
                format="vmap",
                timeout_seconds=settings.AD_CSAI_TIMEOUT_SECONDS,
                show_countdown=settings.AD_CSAI_SHOW_COUNTDOWN,
            )

    ssai_override = ad_map.get("ssai_enabled")
    ssai_allowed = (
        bool(playback_url)
        and (
            bool(ssai_override)
            if ssai_override is not None
            else settings.SSAI_ENABLED_FOR_VOD
        )
    )
    ssai_url = _build_ssai_url(
        stream_url=playback_url or "",
        content_type="video",
        content_id=str(video.id),
        session_id=session_id,
        client_slug=slug,
    ) if ssai_allowed and playback_url else None

    if chosen_strategy == "none":
        return PlaybackDecisionOut(
            content_type="video",
            content_id=str(video.id),
            ad_mode="none",
            strategy=chosen_strategy,
            playback_url=playback_url,
            creatives=[],
        )

    if chosen_strategy == "ssai":
        if ssai_url:
            return PlaybackDecisionOut(
                content_type="video",
                content_id=str(video.id),
                ad_mode="ssai",
                strategy=chosen_strategy,
                playback_url=ssai_url,
                ssai_url=ssai_url,
                fallback=PlaybackFallback(csai=csai_config) if csai_config else None,
                creatives=creatives,
                tracking_token=tracking_token,
            )
        # hard-SSAI fallback policy: degrade to no-ads when stitcher is unavailable
        return PlaybackDecisionOut(
            content_type="video",
            content_id=str(video.id),
            ad_mode="none",
            strategy=chosen_strategy,
            playback_url=playback_url,
            creatives=creatives,
            tracking_token=tracking_token,
        )

    if chosen_strategy == "csai":
        return PlaybackDecisionOut(
            content_type="video",
            content_id=str(video.id),
            ad_mode="csai" if csai_config else "none",
            strategy=chosen_strategy,
            playback_url=playback_url,
            ad_config=csai_config,
            creatives=creatives,
            tracking_token=tracking_token,
        )

    # hybrid default: prefer SSAI, then fallback to CSAI, then no-ads
    if ssai_url:
        return PlaybackDecisionOut(
            content_type="video",
            content_id=str(video.id),
            ad_mode="ssai",
            strategy="hybrid",
            playback_url=ssai_url,
            ssai_url=ssai_url,
            fallback=PlaybackFallback(csai=csai_config) if csai_config else None,
            creatives=creatives,
            tracking_token=tracking_token,
        )

    return PlaybackDecisionOut(
        content_type="video",
        content_id=str(video.id),
        ad_mode="csai" if csai_config else "none",
        strategy="hybrid",
        playback_url=playback_url,
        ad_config=csai_config,
        creatives=creatives,
        tracking_token=tracking_token,
    )


@router.get(
    "/playback/video/{video_id}/vmap.xml",
    summary="Dynamically generated VMAP ad break schedule for a video's pre/mid/post-roll creatives",
)
async def get_video_vmap(
    video_id: str,
    slug: str = Query(..., description="Client platform slug"),
    session_id: str = Query(..., description="Session ID from the playback decision call"),
    tt: str = Query(..., description="Ad playback tracking token from the playback decision call"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetched directly by the IMA3 SDK as the `adTagUrl`. Recomputes creatives fresh (no
    caching) so ad targeting/budget/date checks are always current, then renders them as a
    VMAP document — same mechanism used for a manually-pasted VMAP tag from an ad server.
    """
    client = await _resolve_client(slug, db)
    result = await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.client_id == client.id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
            Video.status == ContentStatus.PUBLISHED,
        )
    )
    video = result.scalar_one_or_none()
    if not video:
        return Response(
            content=_EMPTY_VMAP,
            media_type="application/xml; charset=utf-8",
            headers={"Access-Control-Allow-Origin": "*"},
        )

    creatives = await _resolve_video_creatives(video, client.id, db)
    video_ads = [item for item in creatives if item.ad_type == "video"]
    xml_body = _build_vmap_xml(video.id, video_ads, session_id, tt)
    # The Google IMA SDK fetches this tag cross-origin from imasdk.googleapis.com,
    # so the public ad tag must be readable by any origin.
    return Response(
        content=xml_body,
        media_type="application/xml; charset=utf-8",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@router.post("/ads/{ad_id}/events", status_code=status.HTTP_202_ACCEPTED)
async def ingest_public_ad_event(
    ad_id: str,
    slug: str = Query(..., description="Client platform slug"),
    payload: AdvertisementEventCreate = ...,
    db: AsyncSession = Depends(get_db),
):
    """Accept idempotent player events without exposing tenant data across clients."""
    client = await _resolve_client(slug, db)
    try:
        ad_uuid = uuid.UUID(ad_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid advertisement ID") from exc
    if payload.advertisement_id != ad_uuid:
        raise HTTPException(status_code=400, detail="Advertisement ID mismatch")
    claims = decode_token(payload.tracking_token or "")
    if (
        claims.get("type") != "ad_playback"
        or claims.get("client_id") != str(client.id)
        or claims.get("session_id") != payload.session_id
        or str(ad_uuid) not in claims.get("advertisement_ids", [])
        or claims.get("sub") != payload.content_id
    ):
        raise HTTPException(status_code=403, detail="Invalid ad tracking token")

    ad = await db.scalar(select(Advertisement).where(
        Advertisement.id == ad_uuid,
        Advertisement.client_id == client.id,
        Advertisement.status == AdStatus.ACTIVE,
    ))
    if not ad:
        raise HTTPException(status_code=404, detail="Advertisement not found")
    billable = 0.0
    if payload.event_type == AdEventType.IMPRESSION and ad.cost_per_impression:
        billable = float(ad.cost_per_impression)
    elif payload.event_type == AdEventType.CLICK and ad.cost_per_click:
        billable = float(ad.cost_per_click)
    inserted_id = await db.scalar(pg_insert(AdvertisementEvent).values(
        client_id=client.id,
        advertisement_id=ad.id,
        event_id=payload.event_id,
        event_type=payload.event_type,
        session_id=payload.session_id,
        content_type=payload.content_type,
        content_id=payload.content_id,
        placement_type=payload.placement_type,
        occurred_at=payload.occurred_at,
        event_metadata=payload.metadata,
        billable_amount=billable,
    ).on_conflict_do_nothing(
        constraint="uq_ad_event_client_event_id",
    ).returning(AdvertisementEvent.id))
    if inserted_id is None:
        return {"accepted": True, "duplicate": True}
    if payload.event_type == AdEventType.IMPRESSION:
        ad.total_impressions = Advertisement.total_impressions + 1
    elif payload.event_type == AdEventType.CLICK:
        ad.total_clicks = Advertisement.total_clicks + 1
    return {"accepted": True, "duplicate": False}


@router.get("/ads/{ad_id}/beacon", status_code=status.HTTP_204_NO_CONTENT)
async def ingest_ad_beacon(
    ad_id: str,
    event: str = Query(...),
    session_id: str = Query(...),
    content_id: str = Query(...),
    placement_type: str = Query(...),
    break_key: str = Query(""),
    tt: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    GET tracking pixel fired directly by the IMA SDK for VMAP-scheduled video ads. VAST
    trackers can only issue plain GET requests, so this mirrors /ads/{ad_id}/events but
    reads its payload from the query string instead of a JSON body. Never raises to the
    caller — an ad player must not break playback on a tracking failure.
    """
    try:
        ad_uuid = uuid.UUID(ad_id)
        event_type = AdEventType(event)
    except ValueError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    claims = decode_token(tt)
    if (
        claims.get("type") != "ad_playback"
        or claims.get("session_id") != session_id
        or claims.get("sub") != content_id
        or str(ad_uuid) not in claims.get("advertisement_ids", [])
    ):
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        client_uuid = uuid.UUID(claims.get("client_id", ""))
    except ValueError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    ad = await db.scalar(select(Advertisement).where(
        Advertisement.id == ad_uuid,
        Advertisement.client_id == client_uuid,
        Advertisement.status == AdStatus.ACTIVE,
    ))
    if not ad:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    billable = 0.0
    if event_type == AdEventType.IMPRESSION and ad.cost_per_impression:
        billable = float(ad.cost_per_impression)
    elif event_type == AdEventType.CLICK and ad.cost_per_click:
        billable = float(ad.cost_per_click)

    inserted_id = await db.scalar(pg_insert(AdvertisementEvent).values(
        client_id=client_uuid,
        advertisement_id=ad.id,
        event_id=f"{session_id}:{ad_id}:{break_key}:{event}",
        event_type=event_type,
        session_id=session_id,
        content_type="video",
        content_id=content_id,
        placement_type=placement_type,
        occurred_at=datetime.now(timezone.utc),
        event_metadata={},
        billable_amount=billable,
    ).on_conflict_do_nothing(
        constraint="uq_ad_event_client_event_id",
    ).returning(AdvertisementEvent.id))
    if inserted_id is not None:
        if event_type == AdEventType.IMPRESSION:
            ad.total_impressions = Advertisement.total_impressions + 1
        elif event_type == AdEventType.CLICK:
            ad.total_clicks = Advertisement.total_clicks + 1
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/live-streams",
    response_model=list[PublicLiveStreamOut],
    summary="List live streams for a client storefront — no auth required",
)
async def list_public_live_streams(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)

    q = (
        select(LiveStream)
        .where(
            LiveStream.client_id == client.id,
            LiveStream.is_active.is_(True),
        )
        .order_by(LiveStream.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    return result.scalars().all()


@router.get(
    "/ppv-events",
    response_model=list[PublicPPVEventOut],
    summary="List active PPV events for a client storefront — no auth required",
)
async def list_public_ppv_events(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)
    result = await db.execute(
        select(PPVEvent)
        .where(PPVEvent.client_id == client.id, PPVEvent.is_active.is_(True))
        .order_by(PPVEvent.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return result.scalars().all()


@router.get(
    "/ppv-events/{event_id}",
    response_model=PublicPPVEventOut,
    summary="Get a PPV event for a client storefront — no auth required",
)
async def get_public_ppv_event(
    event_id: str,
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)
    result = await db.execute(
        select(PPVEvent).where(
            PPVEvent.id == event_id,
            PPVEvent.client_id == client.id,
            PPVEvent.is_active.is_(True),
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="PPV event not found.")
    return event


@router.get(
    "/live-streams/{stream_id}",
    response_model=PublicLiveStreamOut,
    summary="Get a single live stream by ID — no auth required",
)
async def get_public_live_stream(
    stream_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id,
            LiveStream.is_active.is_(True),
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found.")
    return stream


@router.get(
    "/playback/live-stream/{stream_id}",
    response_model=PlaybackDecisionOut,
    summary="Resolve hybrid playback strategy for live stream (SSAI preferred + CSAI fallback)",
)
async def resolve_live_stream_playback(
    stream_id: str,
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    session_id: str | None = Query(None, description="Opaque playback session ID for ad tracking"),
    strategy: str | None = Query(
        None,
        description="Override strategy: hybrid|csai|ssai|none (defaults to server policy)",
    ),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db)

    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id,
            LiveStream.client_id == client.id,
            LiveStream.is_active.is_(True),
        )
    )
    stream = result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found.")

    chosen_strategy = _normalise_strategy(strategy or settings.AD_HYBRID_DEFAULT_MODE)
    recording_url = None
    if not stream.is_live and stream.recording_s3_key:
        recording_url = f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}/api/v1/rtmp/recordings/{stream.recording_filename}"

    playback_url = recording_url if recording_url else stream.stream_url
    content_type = "video" if recording_url else "live_stream"
    # Live streams do not currently store per-content ad tags, so use global defaults.
    csai_config = _make_csai_config(None)

    ssai_allowed = (settings.SSAI_ENABLED_FOR_VOD if content_type == "video" else settings.SSAI_ENABLED_FOR_LIVE) and bool(playback_url)
    ssai_url = _build_ssai_url(
        stream_url=playback_url or "",
        content_type=content_type,
        content_id=str(stream.id),
        session_id=session_id,
        client_slug=slug,
    ) if ssai_allowed and playback_url else None

    if chosen_strategy == "none":
        return PlaybackDecisionOut(
            content_type=content_type,
            content_id=str(stream.id),
            ad_mode="none",
            strategy=chosen_strategy,
            playback_url=playback_url,
        )

    if chosen_strategy == "ssai":
        if ssai_url:
            return PlaybackDecisionOut(
                content_type=content_type,
                content_id=str(stream.id),
                ad_mode="ssai",
                strategy=chosen_strategy,
                playback_url=ssai_url,
                ssai_url=ssai_url,
                fallback=PlaybackFallback(csai=csai_config) if csai_config else None,
            )
        return PlaybackDecisionOut(
            content_type=content_type,
            content_id=str(stream.id),
            ad_mode="none",
            strategy=chosen_strategy,
            playback_url=playback_url,
        )

    if chosen_strategy == "csai":
        return PlaybackDecisionOut(
            content_type=content_type,
            content_id=str(stream.id),
            ad_mode="csai" if csai_config else "none",
            strategy=chosen_strategy,
            playback_url=playback_url,
            ad_config=csai_config,
        )

    if ssai_url:
        return PlaybackDecisionOut(
            content_type=content_type,
            content_id=str(stream.id),
            ad_mode="ssai",
            strategy="hybrid",
            playback_url=ssai_url,
            ssai_url=ssai_url,
            fallback=PlaybackFallback(csai=csai_config) if csai_config else None,
        )

    return PlaybackDecisionOut(
        content_type=content_type,
        content_id=str(stream.id),
        ad_mode="csai" if csai_config else "none",
        strategy="hybrid",
        playback_url=playback_url,
        ad_config=csai_config,
    )


def _project_loop_epg(
    programs: list[EPGProgram],
    range_start: datetime,
    range_end: datetime,
) -> list[dict]:
    """
    Project a looping EPG schedule into [range_start, range_end).

    Programs are cycled indefinitely in sort_order. The first program's
    start_time is used as the loop anchor. If the anchor is in the future,
    we walk backwards to find the cycle that covers range_start.
    """
    if not programs:
        return []

    total_minutes = sum(p.duration_minutes for p in programs)
    if total_minutes <= 0:
        return []

    # Use the earliest start_time as anchor
    anchor = min(p.start_time for p in programs)
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=timezone.utc)

    total_delta = timedelta(minutes=total_minutes)

    # Find the cycle that covers range_start, regardless of whether the anchor
    # is in the past or future.  Using floor division ensures negative elapsed
    # (anchor in the future) correctly steps the cycle start backward.
    elapsed = range_start - anchor
    full_cycles = int(elapsed.total_seconds() // total_delta.total_seconds())
    cycle_offset = total_delta * full_cycles

    results: list[dict] = []
    cycle_start = anchor + cycle_offset

    # Generate enough cycles to cover the range
    while cycle_start < range_end:
        slot = cycle_start
        for prog in sorted(programs, key=lambda p: p.sort_order):
            prog_start = slot
            prog_end = slot + timedelta(minutes=prog.duration_minutes)

            if prog_end > range_start and prog_start < range_end:
                results.append({
                    "id": str(prog.id),
                    "client_id": str(prog.client_id),
                    "channel_id": str(prog.channel_id),
                    "video_id": str(prog.video_id) if prog.video_id else None,
                    "title": prog.title,
                    "description": prog.description,
                    "start_time": prog_start.isoformat(),
                    "end_time": prog_end.isoformat(),
                    "duration_minutes": prog.duration_minutes,
                    "category": prog.category,
                    "rating": prog.rating,
                    "thumbnail_url": prog.thumbnail_url,
                    "sort_order": prog.sort_order,
                    "playout_mode": prog.playout_mode,
                    "created_at": prog.created_at.isoformat() if prog.created_at else None,
                    "updated_at": prog.updated_at.isoformat() if prog.updated_at else None,
                })
            slot = prog_end

        cycle_start += total_delta

    results.sort(key=lambda x: x["start_time"])
    return results


@router.get(
    "/live-streams/{stream_id}/epg",
    summary="Get EPG schedule for a live stream — no auth required",
)
async def get_public_live_stream_epg(
    stream_id: str,
    date: str | None = Query(
        None,
        description="Start date YYYY-MM-DD (UTC). Defaults to today.",
    ),
    days: int = Query(1, ge=1, le=7, description="Number of days to return (1-7)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the EPG (program schedule) for a live-stream channel.

    - For **schedule** mode programs: returns programs whose time range overlaps
      the requested day(s).
    - For **loop** mode programs: projects the repeating cycle forward so the
      frontend always gets a populated schedule regardless of clock time.
    """
    # Resolve the stream
    stream_result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == stream_id,
            LiveStream.is_active.is_(True),
        )
    )
    stream = stream_result.scalar_one_or_none()
    if not stream:
        raise HTTPException(status_code=404, detail="Live stream not found.")

    # Parse requested date range (UTC)
    if date:
        try:
            day_start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD") from exc
    else:
        now = datetime.now(timezone.utc)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    range_start = day_start
    range_end = day_start + timedelta(days=days)

    # Fetch all programs for the channel
    prog_result = await db.execute(
        select(EPGProgram)
        .where(EPGProgram.channel_id == stream_id)
        .order_by(EPGProgram.sort_order, EPGProgram.start_time)
    )
    programs = prog_result.scalars().all()

    if not programs:
        return {"channel_id": stream_id, "programs": []}

    # Determine playout mode from the first program (all programs in a schedule share a mode)
    playout_mode = programs[0].playout_mode if programs else "schedule"

    if playout_mode == "loop":
        projected = _project_loop_epg(list(programs), range_start, range_end)
        return {"channel_id": stream_id, "programs": projected}

    # schedule mode — filter by overlap with the requested range
    schedule_programs = []
    for p in programs:
        p_start = p.start_time
        p_end = p.end_time
        if p_start.tzinfo is None:
            p_start = p_start.replace(tzinfo=timezone.utc)
        if p_end.tzinfo is None:
            p_end = p_end.replace(tzinfo=timezone.utc)
        if p_end > range_start and p_start < range_end:
            schedule_programs.append({
                "id": str(p.id),
                "client_id": str(p.client_id),
                "channel_id": str(p.channel_id),
                "video_id": str(p.video_id) if p.video_id else None,
                "title": p.title,
                "description": p.description,
                "start_time": p_start.isoformat(),
                "end_time": p_end.isoformat(),
                "duration_minutes": p.duration_minutes,
                "category": p.category,
                "rating": p.rating,
                "thumbnail_url": p.thumbnail_url,
                "sort_order": p.sort_order,
                "playout_mode": p.playout_mode,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            })

    # If no schedule-mode programs overlap the requested date range (e.g. programs
    # were saved for a different day), fall back to loop-projection so the guide is
    # never empty for an active channel that has programs.
    if not schedule_programs:
        schedule_programs = _project_loop_epg(list(programs), range_start, range_end)

    return {"channel_id": stream_id, "programs": schedule_programs}


async def _fetch_category_items(
    ctype: str,
    cat: Category,
    client_id,
    items_per_row: int,
    db: AsyncSession,
) -> list:
    """Return content items for *cat* filtered strictly through the M2M join."""
    from app.schemas.client.content import _refresh_s3_url
    
    if ctype == "video":
        res = await db.execute(
            select(Video)
            .join(Video.categories)
            .where(
                Video.client_id == client_id,
                Category.id == cat.id,
                Video.deleted_at.is_(None),
                Video.is_active.is_(True),
                Video.status == ContentStatus.PUBLISHED,
            )
            .order_by(Video.created_at.desc())
            .limit(items_per_row)
        )
        videos = []
        for v in res.scalars().all():
            video_url, video_display_url, hls_url = _public_video_media_urls(v)
            video_dict = {
                "id": v.id,
                "title": v.title,
                "slug": v.slug,
                "short_description": v.short_description,
                "long_description": v.long_description,
                "categories": v.categories,
                "age_rating": v.age_rating,
                "content_classification": v.content_classification,
                "language": v.language or [],
                "rating": v.rating,
                "duration": v.duration,
                "cast_crew": v.cast_crew or [],
                "related_video_ids": v.related_video_ids or [],
                "is_featured": v.is_featured,
                "is_active": v.is_active,
                "is_slider": v.is_slider,
                "video_url": video_url,
                "video_display_url": video_display_url,
                "hls_url": hls_url,
                "hls_display_url": _hls_display_url(v),
                "thumbnails": v.thumbnails or {},
                "trailer_type": v.trailer_type,
                "trailer_url": v.trailer_url,
                "access_type": v.access_type,
                "subscription_plan_ids": v.subscription_plan_ids or [],
                "ppv_price": v.ppv_price,
                "publish_at": v.publish_at,
                "created_at": v.created_at,
                "updated_at": v.updated_at,
            }
            videos.append(PublicVideoOut(**video_dict))
        return videos

    if ctype == "series":
        res = await db.execute(
            select(Series)
            .join(Series.categories)
            .where(
                Series.client_id == client_id,
                Category.id == cat.id,
                Series.status == "published",
            )
            .order_by(Series.created_at.desc())
            .limit(items_per_row)
        )
        return [SeriesOut.model_validate(s) for s in res.scalars().all()]

    if ctype == "livestream":
        res = await db.execute(
            select(LiveStream)
            .join(LiveStream.categories)
            .where(
                LiveStream.client_id == client_id,
                Category.id == cat.id,
                LiveStream.is_active.is_(True),
            )
            .order_by(LiveStream.created_at.desc())
            .limit(items_per_row)
        )
        return [PublicLiveStreamOut.model_validate(ls) for ls in res.scalars().all()]

    if ctype == "audio":
        res = await db.execute(
            select(Audio)
            .join(Audio.categories)
            .where(
                Audio.client_id == client_id,
                Category.id == cat.id,
                Audio.status == "published",
            )
            .order_by(Audio.created_at.desc())
            .limit(items_per_row)
        )
        return [AudioOut.model_validate(a) for a in res.scalars().all()]

    return []


@router.get(
    "/home-contents",
    response_model=HomeContentsOut,
    summary="Paginated category rows with content — used by storefront home page",
)
async def get_home_contents(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    page: int = Query(1, ge=1, description="Which page of category rows to return"),
    page_size: int = Query(
        2,
        ge=1,
        le=20,
        description="Number of category rows **per content type** per page (default 2)",
    ),
    content_type: str | None = Query(
        None,
        description="Filter to a single content type: video | series | livestream | audio",
    ),
    items_per_row: int = Query(10, ge=1, le=50, description="Max content items per category row"),
    db: AsyncSession = Depends(get_db),
) -> HomeContentsOut:
    """
    Returns up to ``page_size`` non-empty category rows **per content type** per page.

    With the default ``page_size=2`` and all four types active, page 1 returns
    up to 2 video rows + 2 series rows + 2 livestream rows + 2 audio rows = up to 8 rows.
    Page 2 returns the next 2 from each type, and so on.

    Only categories that have at least one published/active content item assigned
    to them via the M2M join are included.  ``has_more`` is ``True`` when any
    content type has further pages.
    """
    client = await _resolve_client(slug, db)

    all_types = ["video", "series", "livestream", "audio"]
    types_to_query = [content_type] if content_type in all_types else all_types

    offset = (page - 1) * page_size
    collected: list[HomeCategoryRow] = []
    has_more = False

    for ctype in types_to_query:
        cats_result = await db.execute(
            select(Category)
            .where(
                Category.client_id == client.id,
                Category.content_types.contains([ctype]),
            )
            .order_by(Category.sort_order, Category.name)
        )
        all_cats = cats_result.scalars().all()

        # Walk categories for this type, skip empties, paginate
        non_empty: list[HomeCategoryRow] = []
        for cat in all_cats:
            # Stop early once we have one extra beyond what this page needs
            if len(non_empty) > offset + page_size:
                break
            items = await _fetch_category_items(ctype, cat, client.id, items_per_row, db)
            if not items:
                continue
            non_empty.append(
                HomeCategoryRow(
                    category_id=cat.id,
                    category_name=cat.name,
                    category_slug=cat.slug,
                    content_type=ctype,
                    items=items,
                )
            )

        page_slice = non_empty[offset: offset + page_size]
        if len(non_empty) > offset + page_size:
            has_more = True
        collected.extend(page_slice)

    return HomeContentsOut(
        rows=collected,
        page=page,
        page_size=page_size,
        has_more=has_more,
    )


# ─── Static Pages ─────────────────────────────────────────────────────────────

@router.get(
    "/pages",
    response_model=list[PublicPageOut],
    summary="List published static pages for a client storefront — no auth required",
)
async def list_public_pages(
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db, enforce_plan=False)
    result = await db.execute(
        select(ClientPage)
        .where(
            ClientPage.client_id == client.id,
            ClientPage.status == "published",
            ClientPage.is_active.is_(True),
        )
        .order_by(ClientPage.sort_order, ClientPage.title)
    )
    return result.scalars().all()


@router.get(
    "/pages/{page_slug}",
    response_model=PublicPageOut,
    summary="Get a single published page by slug — no auth required",
)
async def get_public_page(
    page_slug: str,
    slug: str = Query(..., description="Client platform slug, e.g. 'kalingo-tv'"),
    db: AsyncSession = Depends(get_db),
):
    client = await _resolve_client(slug, db, enforce_plan=False)
    result = await db.execute(
        select(ClientPage).where(
            ClientPage.client_id == client.id,
            ClientPage.slug == page_slug,
            ClientPage.status == "published",
            ClientPage.is_active.is_(True),
        )
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found.")
    return page


def _build_demo_ack_html(full_name: str) -> str:
    name = full_name or "there"
    return (
        f"<p>Hi {name},</p>"
        "<p>Thanks for reaching out to StreamTVDepot and booking a demo.</p>"
        "<p>Our team has received your request and will contact you within one business day.</p>"
        "<p>Regards,<br>StreamTVDepot Team</p>"
    )


@router.post(
    "/demo-bookings",
    response_model=DemoBookingCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a public demo booking request",
)
async def create_demo_booking(
    payload: DemoBookingCreate,
    db: AsyncSession = Depends(get_db),
):
    booking = DemoBookingRequest(
        full_name=payload.full_name,
        work_email=str(payload.work_email),
        company=payload.company,
        role=payload.role,
        country_region=payload.country_region,
        phone=payload.phone,
        project_details=payload.project_details,
    )
    db.add(booking)
    try:
        await db.flush()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Failed to persist demo booking request")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Demo booking service is temporarily unavailable. Please try again shortly.",
        )

    # Persist the booking first so email/logging issues do not block submissions.
    await db.commit()
    await db.refresh(booking)
    booking_id = str(booking.id)

    acknowledged = False
    try:
        acknowledged = await send_system_email(
            db,
            event_key="demo_booking_acknowledgement",
            to_email=booking.work_email,
            to_name=booking.full_name,
            subject="We received your StreamTVDepot demo request",
            body_text=(
                f"Hi {booking.full_name},\n\n"
                "Thanks for reaching out to StreamTVDepot and booking a demo.\n"
                "Our team has received your request and will contact you within one business day.\n\n"
                "Regards,\nStreamTVDepot Team"
            ),
            metadata={"booking_id": booking_id},
        )

        if acknowledged:
            booking.acknowledged_email_sent_at = datetime.utcnow()
            await db.commit()
            await db.refresh(booking)
    except Exception:
        await db.rollback()
        logger.exception("Demo booking acknowledgement email failed", extra={"booking_id": booking_id})

    try:
        platform_email = await get_platform_notification_email(db)
        if platform_email:
            await send_system_email(
                db,
                event_key="demo_booking_superadmin_notice",
                to_email=platform_email,
                subject=f"New demo booking from {booking.full_name}",
                body_text=(
                    "A new demo request was submitted.\n\n"
                    f"Name: {booking.full_name}\n"
                    f"Email: {booking.work_email}\n"
                    f"Company: {booking.company}\n"
                    f"Country/Region: {booking.country_region}\n"
                    f"Phone: {booking.phone}\n"
                ),
                metadata={"booking_id": booking_id},
            )
            await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Demo booking superadmin notification failed", extra={"booking_id": booking_id})

    return DemoBookingCreateResponse(
        id=booking.id,
        message="Demo request submitted successfully.",
        acknowledged_email_triggered=acknowledged,
    )


@router.post(
    "/contact-submissions",
    response_model=ContactSubmissionCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a public contact submission (main site or client-specific)",
)
async def create_contact_submission(
    payload: ContactSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    x_client_slug: str | None = Header(None, alias="X-Client-Slug"),
):
    client_slug = (payload.client_slug or x_client_slug or "").strip()
    client_id = None
    
    # Only resolve client if slug is provided; otherwise, this is a main-site inquiry
    if client_slug:
        try:
            client = await _resolve_client(client_slug, db, enforce_plan=False)
            client_id = client.id
        except (HTTPException, Exception):
            # Client not found or any error — allow submission as a general inquiry
            # This handles both platform-not-found (HTTPException) and other errors
            client_id = None
    
    submission = ContactSubmission(
        client_id=client_id,
        full_name=payload.full_name.strip(),
        work_email=str(payload.work_email).strip(),
        company=payload.company.strip() if payload.company and payload.company.strip() else None,
        phone=payload.phone.strip() if payload.phone and payload.phone.strip() else None,
        subject=payload.subject.strip() if payload.subject and payload.subject.strip() else None,
        message=payload.message.strip(),
        status=ContactSubmissionStatus.UNREAD,
    )
    db.add(submission)
    await db.flush()

    await send_system_email(
        db,
        event_key="contact_submission_acknowledgement",
        to_email=submission.work_email,
        to_name=submission.full_name,
        subject="We received your contact request",
        body_text=(
            f"Hi {submission.full_name},\n\n"
            "Thanks for contacting StreamTVDepot. Our team has received your message and will get back to you soon.\n\n"
            "Regards,\nStreamTVDepot Team"
        ),
        client_id=client_id,
        metadata={"submission_id": str(submission.id)},
    )

    notify_email = None
    if client_id:
        notify_email = await get_client_notification_email(db, client_id)
    if not notify_email:
        notify_email = await get_platform_notification_email(db)

    if notify_email:
        await send_system_email(
            db,
            event_key="contact_submission_notification",
            to_email=notify_email,
            subject=f"New contact submission from {submission.full_name}",
            body_text=(
                "A new contact submission was received.\n\n"
                f"Name: {submission.full_name}\n"
                f"Email: {submission.work_email}\n"
                f"Company: {submission.company or '-'}\n"
                f"Subject: {submission.subject or '-'}\n"
                f"Message: {submission.message}\n"
            ),
            client_id=client_id,
            metadata={"submission_id": str(submission.id)},
        )

    await db.commit()
    await db.refresh(submission)

    return ContactSubmissionCreateResponse(
        id=submission.id,
        message="Contact request submitted successfully.",
    )
