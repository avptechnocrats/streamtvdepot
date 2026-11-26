from datetime import datetime, timezone

from sqlalchemy import String, and_, case, cast, event, func, or_, select
from sqlalchemy.orm import Session, aliased, with_loader_criteria

from app.models.client.content import ContentPartner, ContentStatus, Episode, MediaAssetRendition, Series, Video
from app.models.client.partner_delivery import ContentLicense, PartnerContent


def _license_conditions(license_row, country, access_type):
    now = datetime.now(timezone.utc)
    access_type = func.lower(cast(access_type, String))
    mode = case((access_type == "subscription", "svod"),
        (access_type.in_(["pay_per_view", "ppv", "rental", "rent"]), "tvod"), else_="avod")
    included = license_row.included_countries
    excluded = license_row.excluded_countries
    return [license_row.revoked_at.is_(None), license_row.license_type == mode,
        or_(license_row.starts_at.is_(None), license_row.starts_at <= now),
        or_(license_row.ends_at.is_(None), license_row.ends_at > now),
        or_(included == [], included.contains([country])) if country else included == [],
        ~excluded.contains([country]) if country else excluded == []]


def _parent_not_revoked(identity, season_number):
    ancestor = aliased(PartnerContent)
    return ~select(ancestor.id).where(
        ancestor.client_id == identity.client_id, ancestor.partner_id == identity.partner_id,
        ancestor.revoked_at.is_not(None),
        or_(and_(ancestor.kind == "series", ancestor.sku == identity.parent_sku),
            and_(ancestor.kind == "season", ancestor.parent_sku == identity.parent_sku, ancestor.season_number == season_number)),
    ).correlate(identity).exists()


def content_rights_filter(model, country: str | None):
    identity = aliased(PartnerContent)
    license_row = aliased(ContentLicense)
    partner = aliased(ContentPartner)
    kind = "movie" if model is Video else "episode" if model is Episode else "series"
    matching = [identity.client_id == model.client_id, identity.content_id == model.id, identity.kind == kind]
    mapped = select(identity.id).where(*matching).correlate(model).exists()
    if model is Series:
        child = aliased(PartnerContent)
        episode = aliased(Episode)
        active = select(identity.id).join(child, and_(
            child.client_id == identity.client_id, child.partner_id == identity.partner_id,
            child.parent_sku == identity.sku, child.kind == "episode",
        )).join(episode, and_(episode.id == child.content_id, episode.client_id == child.client_id)).join(
            license_row, and_(license_row.partner_content_id == child.id, license_row.client_id == child.client_id),
        ).join(partner, and_(partner.id == identity.partner_id, partner.client_id == identity.client_id)).where(
            *matching, identity.revoked_at.is_(None), child.revoked_at.is_(None),
            partner.status != "inactive", episode.status == ContentStatus.PUBLISHED,
            _parent_not_revoked(child, episode.season_number), *_license_conditions(license_row, country, model.access_type),
        ).correlate(model).exists()
    else:
        if model is Episode:
            series = aliased(Series)
            access_type = select(series.access_type).where(series.id == model.series_id, series.client_id == model.client_id).scalar_subquery()
        else:
            access_type = model.access_type
        active_query = select(identity.id).join(license_row, and_(
            license_row.partner_content_id == identity.id, license_row.client_id == identity.client_id,
        )).join(partner, and_(partner.id == identity.partner_id, partner.client_id == identity.client_id)).where(
            *matching, identity.revoked_at.is_(None), partner.status != "inactive",
            *_license_conditions(license_row, country, access_type),
        )
        if model is Episode:
            active_query = active_query.where(_parent_not_revoked(identity, model.season_number))
        active = active_query.correlate(model).exists()
    ready = True
    if model is not Series:
        ready = select(MediaAssetRendition.id).where(
            MediaAssetRendition.id == model.media_asset_rendition_id,
            MediaAssetRendition.client_id == model.client_id,
            MediaAssetRendition.status == "complete", MediaAssetRendition.hls_manifest_key.is_not(None),
        ).correlate(model).exists()
    return or_(~mapped, and_(model.status == ContentStatus.PUBLISHED, ready, active))


async def license_expiry(db, content, access_type):
    identity = aliased(PartnerContent)
    license_row = aliased(ContentLicense)
    mode = str(getattr(access_type, "value", access_type)).lower()
    license_type = "svod" if mode == "subscription" else "tvod" if mode in {"ppv", "pay_per_view", "rental", "rent"} else "avod"
    now = datetime.now(timezone.utc)
    country = db.info.get("partner_country")
    results = (await db.scalars(select(license_row.ends_at).join(identity, and_(
        identity.id == license_row.partner_content_id, identity.client_id == license_row.client_id,
    )).where(identity.client_id == content.client_id, identity.content_id == content.id,
        license_row.license_type == license_type, license_row.revoked_at.is_(None),
        or_(license_row.starts_at.is_(None), license_row.starts_at <= now),
        or_(license_row.ends_at.is_(None), license_row.ends_at > now),
        or_(license_row.included_countries == [], license_row.included_countries.contains([country])) if country else license_row.included_countries == [],
        ~license_row.excluded_countries.contains([country]) if country else license_row.excluded_countries == [],
    ))).all()
    return None if not results or None in results else max(results)


def playback_ttl(expiry, default: int) -> int:
    if not expiry:
        return default
    remaining = int((expiry - datetime.now(timezone.utc)).total_seconds())
    if remaining < 1:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Content license has expired")
    return min(default, remaining)


@event.listens_for(Session, "do_orm_execute")
def filter_partner_rights(execute_state):
    if not execute_state.is_select or not execute_state.session.info.get("enforce_partner_rights") or execute_state.execution_options.get("partner_admin_preview"):
        return
    country = execute_state.session.info.get("partner_country")
    execute_state.statement = execute_state.statement.options(*[
        with_loader_criteria(model, content_rights_filter(model, country), include_aliases=False)
        for model in (Video, Series, Episode)
    ])