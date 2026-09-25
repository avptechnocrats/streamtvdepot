"""
End-user subscription & access queries.

GET /auth/user/my-subscriptions         → list all active/past subscriptions
GET /auth/user/my-subscriptions/access  → check access to specific content
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_end_user, get_current_end_user_optional
from app.core.config import settings
from app.core.drm import create_key_access_token
from app.models.client.content import (
    Audio,
    EPGProgram,
    Episode,
    LiveStream,
    PPVEvent,
    Series,
    Video,
    audio_categories,
    livestream_categories,
    series_categories,
    video_categories,
)
from app.models.client.payment import Payment
from app.models.client.subscription import (
    ClientSubscriptionPlan,
    PlanType,
    SubscriptionStatus,
    UserSubscription,
)
from app.schemas.client.content import _refresh_s3_url, _refresh_thumbnail_urls
from pydantic import BaseModel

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserPurchaseOut(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    plan_name: str
    plan_type: str
    status: SubscriptionStatus
    started_at: str
    expires_at: str | None
    content_id: uuid.UUID | None
    auto_renew: bool
    content_title: str | None = None
    content_type: str | None = None
    content_thumbnail_url: str | None = None
    content_detail_url: str | None = None
    amount: float | None = None
    currency: str | None = None

    model_config = {"from_attributes": True}


class ContentAccessOut(BaseModel):
    has_access: bool
    access_type: str | None = None   # "subscription" | "ppv" | "rent"
    expires_at: str | None = None


class PlaybackAuthorizationOut(BaseModel):
    stream_url: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_active(sub: UserSubscription) -> bool:
    """Return True if the subscription record is currently valid."""
    now = datetime.now(timezone.utc)
    if sub.status == SubscriptionStatus.PAST_DUE:
        return False
    if sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL):
        return False
    # Queued renewal: started_at is in the future — not yet active
    try:
        if datetime.fromisoformat(sub.started_at) > now:
            return False
    except (ValueError, TypeError):
        pass
    if sub.expires_at is None:
        return True   # Lifetime
    try:
        return datetime.fromisoformat(sub.expires_at) > now
    except (ValueError, TypeError):
        return False


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _subscription_sort_key(sub: UserSubscription) -> tuple[datetime, datetime]:
    started_at = _parse_iso_datetime(sub.started_at) or datetime.min.replace(tzinfo=timezone.utc)
    expires_at = _parse_iso_datetime(sub.expires_at) or datetime.max.replace(tzinfo=timezone.utc)
    return started_at, expires_at


def _effective_subscription_rows(
    rows: list[tuple],
) -> list[tuple]:
    """
    Return only the effective current subscription plus queued renewals.

    Legacy or duplicated overlapping active rows are collapsed to the newest
    currently-active subscription so the client never sees multiple active
    cards for the same subscription stack.
    """
    now = datetime.now(timezone.utc)
    current_rows: list[tuple] = []
    queued_rows: list[tuple] = []

    for row in rows:
        sub, plan_name, plan_type, *extra = row
        if sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL, SubscriptionStatus.PAST_DUE):
            continue
        started_at = _parse_iso_datetime(sub.started_at)
        if started_at and started_at > now:
            queued_rows.append((sub, plan_name, plan_type, *extra))
        elif _is_active(sub):
            current_rows.append((sub, plan_name, plan_type, *extra))

    current_rows.sort(key=lambda row: _subscription_sort_key(row[0]), reverse=True)
    queued_rows.sort(key=lambda row: _subscription_sort_key(row[0]))

    if not current_rows:
        return queued_rows

    effective_current = current_rows[0]
    return [effective_current, *queued_rows]


def _parse_uuid_list(values: list | None) -> list[uuid.UUID]:
    if not values:
        return []
    parsed: list[uuid.UUID] = []
    for value in values:
        try:
            parsed.append(uuid.UUID(str(value)))
        except (ValueError, TypeError):
            continue
    return parsed


async def _content_matches_category_scope(
    db: AsyncSession,
    client_id: uuid.UUID,
    content_id: uuid.UUID,
    category_ids: list[uuid.UUID],
) -> bool:
    if not category_ids:
        return False

    video_hit = await db.execute(
        select(Video.id)
        .join(video_categories, video_categories.c.video_id == Video.id)
        .where(
            Video.client_id == client_id,
            Video.id == content_id,
            video_categories.c.category_id.in_(category_ids),
        )
        .limit(1)
    )
    if video_hit.scalar_one_or_none():
        return True

    live_hit = await db.execute(
        select(LiveStream.id)
        .join(livestream_categories, livestream_categories.c.livestream_id == LiveStream.id)
        .where(
            LiveStream.client_id == client_id,
            LiveStream.id == content_id,
            livestream_categories.c.category_id.in_(category_ids),
        )
        .limit(1)
    )
    if live_hit.scalar_one_or_none():
        return True

    audio_hit = await db.execute(
        select(Audio.id)
        .join(audio_categories, audio_categories.c.audio_id == Audio.id)
        .where(
            Audio.client_id == client_id,
            Audio.id == content_id,
            audio_categories.c.category_id.in_(category_ids),
        )
        .limit(1)
    )
    if audio_hit.scalar_one_or_none():
        return True

    series_hit = await db.execute(
        select(Series.id)
        .join(series_categories, series_categories.c.series_id == Series.id)
        .where(
            Series.client_id == client_id,
            Series.id == content_id,
            series_categories.c.category_id.in_(category_ids),
        )
        .limit(1)
    )
    if series_hit.scalar_one_or_none():
        return True

    episode_series_hit = await db.execute(
        select(Episode.id)
        .join(Series, Series.id == Episode.series_id)
        .join(series_categories, series_categories.c.series_id == Series.id)
        .where(
            Episode.client_id == client_id,
            Episode.id == content_id,
            series_categories.c.category_id.in_(category_ids),
        )
        .limit(1)
    )
    return episode_series_hit.scalar_one_or_none() is not None


async def _get_content_access_type(
    db: AsyncSession,
    client_id: uuid.UUID,
    content_id: uuid.UUID,
) -> str | None:
    """Return the access_type string for the given content item, or None if not found."""
    for stmt in (
        select(Video.access_type).where(Video.client_id == client_id, Video.id == content_id),
        select(LiveStream.access_type).where(LiveStream.client_id == client_id, LiveStream.id == content_id),
        select(PPVEvent.id).where(PPVEvent.client_id == client_id, PPVEvent.id == content_id),
        select(Audio.access_type).where(Audio.client_id == client_id, Audio.id == content_id),
        select(Series.access_type).where(Series.client_id == client_id, Series.id == content_id),
        # Episodes inherit access_type from their parent Series
        select(Series.access_type)
        .join(Episode, Episode.series_id == Series.id)
        .where(Episode.client_id == client_id, Episode.id == content_id),
    ):
        val = (await db.execute(stmt.limit(1))).scalar_one_or_none()
        if val is not None:
            if isinstance(val, uuid.UUID):
                return "pay_per_view"
            return str(val)
    return None


async def _plan_applies_to_content(
    db: AsyncSession,
    client_id: uuid.UUID,
    content_id: uuid.UUID,
    plan: ClientSubscriptionPlan,
) -> bool:
    if bool(plan.applies_to_all_content):
        return True

    scope = str(plan.applies_to_scope or "content")
    if scope == "content":
        allowed_content_ids = {str(v) for v in (plan.applies_to_content_ids or [])}
        return str(content_id) in allowed_content_ids

    if scope == "category_subcategory":
        category_ids = _parse_uuid_list(plan.applies_to_category_ids)
        return await _content_matches_category_scope(db, client_id, content_id, category_ids)

    return False


# ── Routes ────────────────────────────────────────────────────────────────────

async def get_content_access(
    db: AsyncSession,
    client_id: uuid.UUID,
    user_id: uuid.UUID,
    content_id: uuid.UUID,
) -> ContentAccessOut:
    """Resolve the authenticated user's current entitlement for one content item."""
    content_access_type = await _get_content_access_type(db, client_id, content_id)
    if content_access_type is None:
        return ContentAccessOut(has_access=False)

    if content_access_type == "free":
        return ContentAccessOut(has_access=True, access_type="free")

    if content_access_type == "subscription":
        sub_q = (
            select(UserSubscription, ClientSubscriptionPlan)
            .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
            .where(
                UserSubscription.client_id == client_id,
                UserSubscription.user_id == user_id,
                UserSubscription.status.in_([
                    SubscriptionStatus.ACTIVE,
                    SubscriptionStatus.TRIAL,
                    SubscriptionStatus.PAST_DUE,
                ]),
                ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
                ClientSubscriptionPlan.is_active.is_(True),
            )
        )
        for sub, plan in (await db.execute(sub_q)).all():
            if _is_active(sub) and await _plan_applies_to_content(db, client_id, content_id, plan):
                return ContentAccessOut(
                    has_access=True,
                    access_type="subscription",
                    expires_at=sub.expires_at,
                )
        return ContentAccessOut(has_access=False)

    plan_type_map: dict[str, PlanType] = {
        "pay_per_view": PlanType.PPV,
        "ppv": PlanType.PPV,
        "rental": PlanType.RENT,
        "rent": PlanType.RENT,
    }
    required_plan_type = plan_type_map.get(content_access_type)
    if required_plan_type is None:
        return ContentAccessOut(has_access=False)

    ppv_rent_q = (
        select(UserSubscription, ClientSubscriptionPlan.plan_type)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .where(
            UserSubscription.client_id == client_id,
            UserSubscription.user_id == user_id,
            UserSubscription.content_id == content_id,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
            ClientSubscriptionPlan.plan_type == required_plan_type,
        )
    )
    for sub, plan_type in (await db.execute(ppv_rent_q)).all():
        if _is_active(sub):
            return ContentAccessOut(
                has_access=True,
                access_type=plan_type.value,
                expires_at=sub.expires_at,
            )
    return ContentAccessOut(has_access=False)

async def _expire_elapsed_purchases(
    db: AsyncSession,
    client_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Persist elapsed timed purchases as expired before returning purchase data."""
    now = datetime.now(timezone.utc)
    rows = (await db.execute(
        select(UserSubscription).where(
            UserSubscription.client_id == client_id,
            UserSubscription.user_id == user_id,
            UserSubscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL]),
            UserSubscription.expires_at.is_not(None),
        )
    )).scalars().all()

    expired_ids = [
        sub.id
        for sub in rows
        if (expires_at := _parse_iso_datetime(sub.expires_at)) is not None and expires_at <= now
    ]
    if expired_ids:
        await db.execute(
            update(UserSubscription)
            .where(UserSubscription.id.in_(expired_ids))
            .values(status=SubscriptionStatus.EXPIRED)
        )
        await db.commit()

@router.get("", response_model=list[UserPurchaseOut])
async def list_my_subscriptions(
    plan_type: str | None = Query(None, description="Filter by plan_type: subscription | ppv | rent"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all subscription/PPV/rental records for the authenticated user.

    - subscription: returns all-time records sorted by start date desc
    - ppv / rent: returns all records (each entry = one content purchase)
    """
    await _expire_elapsed_purchases(db, current_user._client_id, current_user.id)

    q = (
        select(
            UserSubscription,
            ClientSubscriptionPlan.name,
            ClientSubscriptionPlan.plan_type,
            Payment.amount,
            Payment.currency,
        )
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .outerjoin(Payment, UserSubscription.payment_id == Payment.id)
        .where(
            UserSubscription.client_id == current_user._client_id,
            UserSubscription.user_id == current_user.id,
        )
    )
    if plan_type:
        q = q.where(ClientSubscriptionPlan.plan_type == plan_type)

    q = q.order_by(UserSubscription.created_at.desc())
    rows = (await db.execute(q)).all()

    if not plan_type or plan_type == PlanType.SUBSCRIPTION.value:
        rows = _effective_subscription_rows(rows)

    if plan_type in (PlanType.PPV.value, PlanType.RENT.value):
        start = (page - 1) * page_size
        rows = rows[start:start + page_size]

    result = []
    for sub, plan_name, pt, amount, currency in rows:
        content_title = None
        content_type = None
        content_thumbnail_url = None
        content_detail_url = None
        if sub.content_id:
            content_queries = (
                (Video, "video", "/movies", ("video_h_thumbnail", "video_w_thumbnail", "video_banner")),
                (LiveStream, "live_stream", "/tv-shows", ("portrait", "wide", "banner")),
                (PPVEvent, "ppv_event", "/ppv-events", ("portrait", "wide", "banner")),
            )
            for content_model, resolved_type, route_prefix, thumbnail_keys in content_queries:
                content_result = await db.execute(
                    select(content_model.title, content_model.thumbnails).where(
                        content_model.client_id == current_user._client_id,
                        content_model.id == sub.content_id,
                    ).limit(1)
                )
                content = content_result.one_or_none()
                if content:
                    content_title, thumbnails = content
                    content_type = resolved_type
                    content_detail_url = f"{route_prefix}/{sub.content_id}"
                    if isinstance(thumbnails, dict):
                        thumbnails = _refresh_thumbnail_urls(thumbnails)
                        content_thumbnail_url = next(
                            (thumbnails.get(key) for key in thumbnail_keys if thumbnails.get(key)),
                            None,
                        )
                    break

            if not content_title:
                fallback_queries = ((Audio, "audio"), (Series, "series"))
                for content_model, resolved_type in fallback_queries:
                    content_result = await db.execute(
                        select(content_model.title, content_model.thumbnail_url).where(
                            content_model.client_id == current_user._client_id,
                            content_model.id == sub.content_id,
                        ).limit(1)
                    )
                    content = content_result.one_or_none()
                    if content:
                        content_title, content_thumbnail_url = content
                        content_type = resolved_type
                        content_thumbnail_url = _refresh_s3_url(content_thumbnail_url)
                        break

        result.append(
            UserPurchaseOut(
                id=sub.id,
                plan_id=sub.plan_id,
                plan_name=plan_name,
                plan_type=pt.value if pt else "",
                status=sub.status,
                started_at=sub.started_at,
                expires_at=sub.expires_at,
                content_id=sub.content_id,
                auto_renew=sub.auto_renew,
                content_title=content_title,
                content_type=content_type,
                content_thumbnail_url=content_thumbnail_url,
                content_detail_url=content_detail_url,
                amount=float(amount) if amount is not None else None,
                currency=currency,
            )
        )
    return result


@router.get("/history", response_model=list[UserPurchaseOut])
async def list_subscription_history(
    limit: int = Query(5, ge=1, le=20, description="Maximum number of recent subscription rows to return"),
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the most recent subscription records for the authenticated user.

    This includes active trial rows and other recent subscription records. The history panel
    is intentionally a recent subscription ledger, not just expired or inactive rows.
    """
    q = (
        select(UserSubscription, ClientSubscriptionPlan.name, ClientSubscriptionPlan.plan_type)
        .join(ClientSubscriptionPlan, UserSubscription.plan_id == ClientSubscriptionPlan.id)
        .where(
            UserSubscription.client_id == current_user._client_id,
            UserSubscription.user_id == current_user.id,
            ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
        )
        .order_by(UserSubscription.started_at.desc(), UserSubscription.created_at.desc())
    )
    rows = (await db.execute(q)).all()[:limit]

    result = []
    for sub, plan_name, pt in rows:
        result.append(
            UserPurchaseOut(
                id=sub.id,
                plan_id=sub.plan_id,
                plan_name=plan_name,
                plan_type=pt.value if pt else "",
                status=sub.status,
                started_at=sub.started_at,
                expires_at=sub.expires_at,
                content_id=sub.content_id,
                auto_renew=sub.auto_renew,
            )
        )
    return result


@router.get("/access", response_model=ContentAccessOut)
async def check_content_access(
    content_id: uuid.UUID = Query(..., description="UUID of the content to check access for"),
    current_user=Depends(get_current_end_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Check whether the authenticated user can currently access a specific content item.

    Access is granted only when the user holds the payment type that the content requires:
    - content access_type == "subscription" → user must have an active subscription plan
      that applies to this content.
    - content access_type == "pay_per_view" / "ppv" → user must have an active PPV record
      for this exact content_id.
    - content access_type == "rental" / "rent" → user must have an active Rent record
      for this exact content_id.
    - content access_type == "free" → always granted.
    A subscription plan never unlocks rental or PPV content.
    """
    return await get_content_access(
        db,
        current_user._client_id,
        current_user.id,
        content_id,
    )


@router.post("/playback/videos/{video_id}", response_model=PlaybackAuthorizationOut)
async def authorize_video_playback(
    video_id: uuid.UUID,
    current_user=Depends(get_current_end_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Return an entitlement-scoped HLS manifest URL for a published video.

    Free content is publicly playable — no login required. Subscription, PPV
    and rental content require an authenticated, entitled user; anonymous
    callers get 401 and authenticated-but-unentitled callers get 403.
    """
    video = (await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
        )
    )).scalar_one_or_none()
    if not video or not video.hls_manifest_key:
        raise HTTPException(status_code=404, detail="Stream not available.")

    base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    prefix = settings.API_V1_PREFIX.strip("/")
    stream_url = f"{base}/{prefix}/media/stream/{video_id}/manifest.m3u8"

    # Free content plays for everyone, authenticated or not — no token needed.
    if video.access_type == "free":
        return PlaybackAuthorizationOut(stream_url=stream_url)

    # Paid/subscription content requires a logged-in, entitled user.
    if current_user is None:
        raise HTTPException(status_code=401, detail="Please sign in to watch this video.")

    access = await get_content_access(
        db,
        current_user._client_id,
        current_user.id,
        video_id,
    )
    if not access.has_access:
        raise HTTPException(status_code=403, detail="You do not have access to this video.")

    token = create_key_access_token(video_id=str(video_id), user_id=str(current_user.id))
    return PlaybackAuthorizationOut(stream_url=f"{stream_url}?token={token}")


@router.post(
    "/playback/channels/{channel_id}/videos/{video_id}",
    response_model=PlaybackAuthorizationOut,
)
async def authorize_channel_program_playback(
    channel_id: uuid.UUID,
    video_id: uuid.UUID,
    current_user=Depends(get_current_end_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Authorize playback of an EPG-scheduled video as part of a live channel.

    Linear (channel) playback is gated by the CHANNEL's access type, not the
    individual video's — a free channel plays its whole schedule for everyone,
    even when a scheduled program is a subscription/rental VOD. The requested
    video must actually be scheduled on the channel's EPG, so this route cannot
    be used to unlock arbitrary paid VOD.
    """
    video = (await db.execute(
        select(Video).where(
            Video.id == video_id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
        )
    )).scalar_one_or_none()
    if not video or not video.hls_manifest_key:
        raise HTTPException(status_code=404, detail="Stream not available.")

    channel = (await db.execute(
        select(LiveStream).where(
            LiveStream.id == channel_id,
            LiveStream.is_active.is_(True),
        )
    )).scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not available.")

    # The video must be scheduled on this channel's EPG. This binds the
    # entitlement to the channel and prevents unlocking arbitrary paid VOD.
    scheduled = (await db.execute(
        select(EPGProgram.id).where(
            EPGProgram.channel_id == channel_id,
            EPGProgram.video_id == video_id,
        ).limit(1)
    )).first()
    if scheduled is None:
        raise HTTPException(status_code=403, detail="This video is not scheduled on the channel.")

    base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    prefix = settings.API_V1_PREFIX.strip("/")
    stream_url = f"{base}/{prefix}/media/stream/{video_id}/manifest.m3u8"

    # Free channel — the whole linear schedule is public. A paid VOD still needs a
    # stream token so the media proxy will serve its manifest/key.
    if channel.access_type == "free":
        if video.access_type == "free":
            return PlaybackAuthorizationOut(stream_url=stream_url)
        subject = str(current_user.id) if current_user is not None else "anonymous"
        token = create_key_access_token(video_id=str(video_id), user_id=subject)
        return PlaybackAuthorizationOut(stream_url=f"{stream_url}?token={token}")

    # Paid channel — require an authenticated, channel-entitled user.
    if current_user is None:
        raise HTTPException(status_code=401, detail="Please sign in to watch this channel.")

    access = await get_content_access(
        db,
        current_user._client_id,
        current_user.id,
        channel_id,
    )
    if not access.has_access:
        raise HTTPException(status_code=403, detail="You do not have access to this channel.")

    token = create_key_access_token(video_id=str(video_id), user_id=str(current_user.id))
    return PlaybackAuthorizationOut(stream_url=f"{stream_url}?token={token}")

