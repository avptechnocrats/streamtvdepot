import asyncio
import hashlib
import json
import logging
import mimetypes
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath
from urllib.parse import unquote_plus

from sqlalchemy import delete, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.episode_transcoding import prepare_media_asset_transcode
from app.core.filmhub import caption_entries, parse_filmhub, safe_filename, split_values
from app.core.storage import copy_partner_asset, media_display_url, partner_aws_client, prepare_partner_caption, provision_partner_storage, read_partner_metadata
from app.models.client.content import AccessType, ContentPartner, ContentStatus, Episode, MediaAsset, MediaAssetRendition, Series, Video
from app.models.client.partner_delivery import ContentCaption, ContentLicense, PartnerContent, PartnerDelivery, PartnerIngest
from app.models.superadmin.client import Client

logger = logging.getLogger(__name__)


def delivery_bucket_name(slug: str, partner_id: uuid.UUID) -> str:
    prefix = re.sub(r"[^a-z0-9-]", "-", settings.PARTNER_DELIVERY_BUCKET_PREFIX.lower()).strip("-")[:15] or "stv-delivery"
    tenant = re.sub(r"[^a-z0-9-]", "-", slug.lower()).strip("-")
    if not tenant:
        raise ValueError("Tenant slug cannot form a valid bucket name")
    suffix = partner_id.hex[:16]
    return f"{prefix}-{tenant[:63 - len(prefix) - len(suffix) - 2].rstrip('-')}-{suffix}"


async def configure_delivery(db, partner, payload) -> None:
    from app.schemas.client.content_partner import DeliveryInput

    delivery = await db.scalar(select(PartnerDelivery).where(
        PartnerDelivery.client_id == partner.client_id, PartnerDelivery.partner_id == partner.id,
    ).with_for_update())
    if delivery and payload is None:
        delivery.enabled = False
        delivery.status = "pending"
        delivery.next_attempt_at = None
        delivery.attempts = 0
        return
    if payload is None:
        return
    config = DeliveryInput.model_validate(payload)
    if partner.status == "inactive" and config.enabled:
        raise ValueError("An inactive partner cannot receive deliveries")
    if config.subscription_plan_ids:
        from app.models.client.subscription import ClientSubscriptionPlan, PlanType
        valid = (await db.scalars(select(ClientSubscriptionPlan.id).where(
            ClientSubscriptionPlan.client_id == partner.client_id,
            ClientSubscriptionPlan.id.in_(config.subscription_plan_ids),
            ClientSubscriptionPlan.is_active.is_(True), ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
        ))).all()
        if set(valid) != set(config.subscription_plan_ids):
            raise ValueError("Select active subscription plans belonging to this tenant")
    if not settings.PARTNER_DELIVERY_ENABLED:
        raise ValueError("Partner delivery is not enabled by the platform operator")
    if not settings.PARTNER_DELIVERY_PRIVATE_SOURCES_CONFIRMED:
        raise ValueError("Configure the production bucket's private-source CloudFront deny rule before enabling partner delivery")
    if not delivery:
        slug = await db.scalar(select(Client.slug).where(Client.id == partner.client_id))
        delivery = PartnerDelivery(id=uuid.uuid4(), client_id=partner.client_id, partner_id=partner.id,
            bucket=delivery_bucket_name(slug, partner.id), region=settings.PARTNER_DELIVERY_REGION)
        db.add(delivery)
    delivery.principal_arn = config.principal_arn
    delivery.enabled = config.enabled
    previous_format = (delivery.options or {}).get("metadata_format", "filmhub_csv_3")
    delivery.options = config.model_dump(exclude={"principal_arn", "enabled"}, mode="json")
    if previous_format != config.metadata_format:
        delivery.last_reconciled_at = None
    delivery.status = "pending"
    delivery.attempts = 0
    delivery.error = None
    delivery.next_attempt_at = None


async def _discover(db, delivery, key: str, version_id: str | None = None):
    if not key.startswith(delivery.prefix) or not key.lower().endswith(".csv"):
        return
    s3 = partner_aws_client("s3", delivery.region)
    arguments = {"Bucket": delivery.bucket, "Key": key}
    if version_id and version_id != "null":
        arguments["VersionId"] = version_id
    head = await asyncio.to_thread(s3.head_object, **arguments)
    version_id = head.get("VersionId")
    if not version_id or version_id == "null":
        raise ValueError("Metadata must have a non-null S3 version")
    if head["ContentLength"] > settings.PARTNER_INGEST_MAX_CSV_BYTES:
        raise ValueError("Metadata exceeds configured size limit")
    await db.execute(insert(PartnerIngest).values(
        client_id=delivery.client_id, partner_id=delivery.partner_id, delivery_id=delivery.id,
        metadata_key=key, version_id=version_id, source_modified_at=head["LastModified"], status="pending",
    ).on_conflict_do_nothing(constraint="uq_partner_ingest_version"))


async def _receive_events(db, delivery):
    sqs = partner_aws_client("sqs", delivery.region)
    messages = (await asyncio.to_thread(sqs.receive_message, QueueUrl=delivery.queue_url, MaxNumberOfMessages=10, WaitTimeSeconds=0)).get("Messages", [])
    for message in messages:
        try:
            body = json.loads(message["Body"])
            if body.get("Event") != "s3:TestEvent":
                if not body.get("Records"):
                    raise ValueError("Delivery event contains no S3 records")
                for record in body["Records"]:
                    source = record.get("s3", {})
                    if source.get("bucket", {}).get("name") != delivery.bucket:
                        raise ValueError("Event bucket does not match delivery")
                    item = source["object"]
                    await _discover(db, delivery, unquote_plus(item["key"]), item.get("versionId"))
            await db.commit()
            await asyncio.to_thread(sqs.delete_message, QueueUrl=delivery.queue_url, ReceiptHandle=message["ReceiptHandle"])
        except Exception:
            await db.rollback()
            await db.refresh(delivery)
            logger.exception("Partner event could not be recorded: %s", delivery.id)


async def _reconcile(db, delivery):
    if delivery.last_reconciled_at and delivery.last_reconciled_at > datetime.now(timezone.utc) - timedelta(hours=1):
        return
    s3 = partner_aws_client("s3", delivery.region)
    continuation = delivery.options.get("reconcile_token")
    arguments = {"Bucket": delivery.bucket, "Prefix": delivery.prefix, "MaxKeys": 250}
    if continuation:
        arguments["ContinuationToken"] = continuation
    page = await asyncio.to_thread(s3.list_objects_v2, **arguments)
    for item in page.get("Contents", []):
        if item["Key"].lower().endswith(".csv"):
            try:
                async with db.begin_nested():
                    await _discover(db, delivery, item["Key"])
            except Exception:
                logger.exception("Could not reconcile metadata %s/%s", delivery.bucket, item["Key"])
    delivery.options = {**delivery.options, "reconcile_token": page.get("NextContinuationToken")}
    if not page.get("IsTruncated"):
        delivery.last_reconciled_at = datetime.now(timezone.utc)
    await db.commit()


async def _asset(db, delivery, ingest, slug, filename, assets):
    filename = safe_filename(filename)
    if filename in assets:
        return assets[filename]
    source_key = str(PurePosixPath(ingest.metadata_key).parent / filename)
    if not source_key.startswith(delivery.prefix):
        raise ValueError("Asset escapes delivery prefix")
    scope = "artwork" if PurePosixPath(filename).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} else "private"
    details = await asyncio.to_thread(copy_partner_asset, delivery, source_key, f"{slug}/partners/{delivery.partner_id}/{scope}", ingest.source_modified_at)
    destination = details["s3_key"]
    asset = await db.scalar(select(MediaAsset).where(MediaAsset.client_id == delivery.client_id, MediaAsset.s3_key == destination))
    if not asset:
        content_type = mimetypes.guess_type(filename)[0] or details["content_type"] or "application/octet-stream"
        if PurePosixPath(filename).suffix.lower() == ".mxf":
            content_type = "video/mxf"
        asset = MediaAsset(client_id=delivery.client_id, original_filename=PurePosixPath(filename).name,
            s3_key=destination, url=media_display_url(destination), file_size=details["size"], content_type=content_type)
        db.add(asset)
        await db.flush()
    assets[filename] = asset
    return asset


async def _identity(db, delivery, kind, sku, content_id, modified, **values):
    identity = await db.scalar(select(PartnerContent).where(
        PartnerContent.client_id == delivery.client_id, PartnerContent.partner_id == delivery.partner_id,
        PartnerContent.kind == kind, PartnerContent.sku == sku,
    ))
    if identity:
        return identity
    identity = PartnerContent(client_id=delivery.client_id, partner_id=delivery.partner_id,
        kind=kind, sku=sku, content_id=content_id, source_modified_at=modified, **values)
    db.add(identity)
    await db.flush()
    return identity


async def _import_package(db, delivery, ingest):
    from app.models.client.subscription import ClientSubscriptionPlan, PlanType

    head = await asyncio.to_thread(partner_aws_client("s3", delivery.region).head_object, Bucket=delivery.bucket, Key=ingest.metadata_key)
    if head.get("VersionId") != ingest.version_id:
        return {"skipped": "Superseded metadata version"}
    raw = await asyncio.to_thread(read_partner_metadata, delivery, ingest.metadata_key, ingest.version_id)
    groups = parse_filmhub(raw, timezone_name=delivery.options.get("rights_timezone", "UTC"), max_rows=settings.PARTNER_INGEST_MAX_ROWS)
    slug = await db.scalar(select(Client.slug).where(Client.id == delivery.client_id))
    has_subscription_plans = await db.scalar(select(ClientSubscriptionPlan.id).where(
        ClientSubscriptionPlan.client_id == delivery.client_id,
        ClientSubscriptionPlan.is_active.is_(True), ClientSubscriptionPlan.plan_type == PlanType.SUBSCRIPTION,
    ).limit(1))
    assets = {}
    warnings = []
    imported = []
    for group in groups:
        row = group["row"]
        identity = await db.scalar(select(PartnerContent).where(
            PartnerContent.client_id == delivery.client_id, PartnerContent.partner_id == delivery.partner_id,
            PartnerContent.kind == group["kind"], PartnerContent.sku == group["sku"],
        ))
        if identity and identity.source_modified_at > ingest.source_modified_at:
            continue
        if identity and not delivery.options.get("rights_snapshot_confirmed"):
            raise ValueError("Confirm complete per-title license snapshots before importing updates")
        main = await _asset(db, delivery, ingest, slug, group["filename"], assets)
        rendition = await prepare_media_asset_transcode(db, main)
        if not rendition or rendition.status == "failed":
            raise ValueError(rendition.error_message if rendition else "Main asset is not a video")
        access_type = delivery.options.get("access_type", "subscription")
        if access_type == "subscription" and not has_subscription_plans:
            access_type = "free"
        if group["kind"] == "movie":
            content = await db.scalar(select(Video).where(Video.id == identity.content_id, Video.client_id == delivery.client_id)) if identity else None
            if not content:
                content = Video(id=uuid.uuid4(), client_id=delivery.client_id, partner_id=delivery.partner_id,
                    title=row["Movie/Show Title"], slug=f"{re.sub(r'[^a-z0-9]+', '-', row['Movie/Show Title'].lower()).strip('-')[:180]}-{uuid.uuid4().hex[:8]}",
                    status=ContentStatus.DRAFT, access_type=access_type,
                    subscription_plan_ids=delivery.options.get("subscription_plan_ids", []))
                db.add(content)
            content.title = row["Movie/Show Title"]
            content.short_description = row.get("Movie/Show Sales Pitch")
            content.long_description = row.get("Movie/Show Synopsis")
            content.language = split_values(row.get("Original Spoken Language", ""))
            content.tags = split_values(row.get("Tag(s)", ""))
            content.cast_crew = [{"name": name, "role": role} for column, role in (
                ("Cast", "Actor"), ("Director(s)", "Director"), ("Writer(s)", "Writer"), ("Producer(s)", "Producer"),
            ) for name in split_values(row.get(column, ""))]
            ratings = split_values(row.get("Rating", ""))
            if ratings:
                content.age_rating = ratings[0][:20]
            content.video_url = None
            content.media_asset_rendition_id = rendition.id
            content.transcode_status = rendition.status
            content.hls_manifest_key = rendition.hls_manifest_key
            content.hls_url = rendition.hls_url
            content.drm_key_encrypted = rendition.drm_key_encrypted
            runtime = row.get("Movie Running Time", "")
            if runtime:
                content.duration = int(float(runtime) * 60)
            await db.flush()
        else:
            series_identity = await db.scalar(select(PartnerContent).where(
                PartnerContent.client_id == delivery.client_id, PartnerContent.partner_id == delivery.partner_id,
                PartnerContent.kind == "series", PartnerContent.sku == group["series_sku"],
            ))
            series = await db.scalar(select(Series).where(Series.id == series_identity.content_id, Series.client_id == delivery.client_id)) if series_identity else None
            if not series:
                series = Series(id=uuid.uuid4(), client_id=delivery.client_id, title=row["Movie/Show Title"], status=ContentStatus.DRAFT,
                    access_type=AccessType("ppv" if access_type == "pay_per_view" else access_type),
                    subscription_plan_ids=delivery.options.get("subscription_plan_ids", []), total_seasons=int(row["Season Number"]))
                db.add(series)
                await db.flush()
                series_identity = await _identity(db, delivery, "series", group["series_sku"], series.id, ingest.source_modified_at)
            if series_identity.source_modified_at <= ingest.source_modified_at:
                series.title = row["Movie/Show Title"]
                series.description = row.get("Movie/Show Synopsis")
                series.genre = row.get("Genre")
                series.languages = split_values(row.get("Original Spoken Language", ""))
                series_identity.metadata_json = {**(series_identity.metadata_json or {}), "row": row}
                series_identity.source_modified_at = ingest.source_modified_at
            series.total_seasons = max(series.total_seasons or 1, int(row["Season Number"]))
            season_sku = row.get("Season SKU") or row.get("Episode Season SKU")
            if season_sku:
                await _identity(db, delivery, "season", season_sku, uuid.uuid4(), ingest.source_modified_at,
                    parent_sku=group["series_sku"], season_number=int(row["Season Number"]))
            else:
                warnings.append(f"Season SKU missing for {group['series_sku']} season {row['Season Number']}; season number retained")
            content = await db.scalar(select(Episode).where(Episode.id == identity.content_id, Episode.client_id == delivery.client_id)) if identity else None
            if not content:
                content = Episode(id=uuid.uuid4(), client_id=delivery.client_id, series_id=series.id, title=row["Episode Name"],
                    season_number=int(row["Season Number"]), episode_number=int(row["Episode Number"]), status=ContentStatus.DRAFT)
                db.add(content)
            content.title = row["Episode Name"]
            content.description = row.get("Episode Synopsis")
            content.video_url = main.url
            content.media_asset_rendition_id = rendition.id
            content.season_number = int(row["Season Number"])
            content.episode_number = int(row["Episode Number"])
            runtime = row.get("Episode Running Time", "")
            if runtime:
                content.duration_seconds = int(float(runtime) * 60)
            await db.flush()
        if not identity:
            identity = await _identity(db, delivery, group["kind"], group["sku"], content.id, ingest.source_modified_at,
                parent_sku=group["series_sku"] if group["kind"] == "episode" else None)
        identity.metadata_json = {**(identity.metadata_json or {}), "row": row, "ingest_id": str(ingest.id),
            "auto_publish": delivery.options.get("auto_publish", False), "season_sku": season_sku if group["kind"] == "episode" else None}
        identity.source_modified_at = ingest.source_modified_at
        await db.execute(update(ContentLicense).where(ContentLicense.client_id == delivery.client_id,
            ContentLicense.partner_content_id == identity.id, ContentLicense.revoked_at.is_(None),
        ).values(revoked_at=datetime.now(timezone.utc)))
        for license_row in group["licenses"]:
            db.add(ContentLicense(client_id=delivery.client_id, partner_content_id=identity.id, ingest_id=ingest.id, **license_row))
        await db.execute(delete(ContentCaption).where(ContentCaption.client_id == delivery.client_id, ContentCaption.partner_content_id == identity.id))
        for track in caption_entries(group):
            caption = await _asset(db, delivery, ingest, slug, track["source_filename"], assets)
            vtt_key = await asyncio.to_thread(prepare_partner_caption, caption.s3_key)
            db.add(ContentCaption(client_id=delivery.client_id, partner_content_id=identity.id, s3_key=vtt_key, **track))
        artwork = {}
        for column, target in (("Key Art 2:3 Filename", "portrait"), ("Key Art 3:4 Filename", "portrait_3_4"), ("Key Art 16:9 Filename", "wide"), ("Textless Hero 16:9 Filename", "banner")):
            if row.get(column):
                artwork[target] = (await _asset(db, delivery, ingest, slug, row[column], assets)).url
        for column in ("Other Key Art Filenames", "Other Images Filenames"):
            value = row.get(column, "")
            filenames = re.findall(r"[^,]+?\.(?:jpe?g|png|webp)", value, re.IGNORECASE)
            if value and not filenames:
                warnings.append(f"Unrecognized optional artwork list for {group['sku']}: {column}")
            for filename in filenames:
                await _asset(db, delivery, ingest, slug, filename.strip(), assets)
        if group["kind"] == "movie":
            content.thumbnails = {"video_h_thumbnail": artwork.get("portrait"), "video_w_thumbnail": artwork.get("wide"), "video_banner": artwork.get("banner")}
            if row.get("Trailer Filename"):
                trailer = await _asset(db, delivery, ingest, slug, row["Trailer Filename"], assets)
                from app.core.mediaconvert import PREVIEW_PROFILE
                preview = await prepare_media_asset_transcode(db, trailer, profile=PREVIEW_PROFILE)
                content.trailer_url, content.trailer_type = trailer.url, "upload"
                content.trailer_rendition_id = preview.id if preview else None
        else:
            content.thumbnail_url = artwork.get("wide")
            series.thumbnails = {**(series.thumbnails or {}), **artwork}
            series.thumbnail_url = artwork.get("portrait")
            if row.get("Trailer Filename"):
                trailer = await _asset(db, delivery, ingest, slug, row["Trailer Filename"], assets)
                from app.core.mediaconvert import PREVIEW_PROFILE
                preview = await prepare_media_asset_transcode(db, trailer, profile=PREVIEW_PROFILE)
                if preview:
                    series.trailer_type = "upload"
                    series.trailer_url = f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}{settings.API_V1_PREFIX}/media/stream/series-trailer/{series.id}/manifest.m3u8"
                    series_identity.metadata_json = {**series_identity.metadata_json, "trailer_rendition_id": str(preview.id)}
        imported.append(str(content.id))
    return {"content_ids": imported, "warnings": sorted(set(warnings)), "assets": len(assets), "entities": len(groups)}


async def _sync_video_renditions(db, delivery):
    rows = (await db.execute(select(Video, MediaAssetRendition).join(MediaAssetRendition,
        (Video.media_asset_rendition_id == MediaAssetRendition.id) & (Video.client_id == MediaAssetRendition.client_id),
    ).where(Video.client_id == delivery.client_id, Video.partner_id == delivery.partner_id,
        or_(Video.transcode_status.is_distinct_from(MediaAssetRendition.status),
            Video.transcode_progress.is_distinct_from(MediaAssetRendition.progress),
            Video.hls_manifest_key.is_distinct_from(MediaAssetRendition.hls_manifest_key)),
    ).limit(100))).all()
    for video, rendition in rows:
        video.transcode_status, video.transcode_progress = rendition.status, rendition.progress
        video.hls_manifest_key, video.hls_url = rendition.hls_manifest_key, rendition.hls_url
        video.drm_key_encrypted = rendition.drm_key_encrypted
    await db.commit()


async def _publish_ready(db, delivery):
    if not delivery.enabled or delivery.status != "ready" or not delivery.options.get("auto_publish") or not delivery.options.get("rights_snapshot_confirmed"):
        return
    partner = await db.scalar(select(ContentPartner).where(ContentPartner.id == delivery.partner_id, ContentPartner.client_id == delivery.client_id))
    if not partner or partner.status != "active":
        return
    identities = (await db.scalars(select(PartnerContent).where(
        PartnerContent.client_id == delivery.client_id, PartnerContent.partner_id == delivery.partner_id,
        PartnerContent.revoked_at.is_(None), PartnerContent.kind.in_(["movie", "episode"]),
        PartnerContent.metadata_json["auto_publish"].as_boolean().is_(True),
    ))).all()
    for identity in identities:
        if identity.metadata_json.get("publication_complete"):
            continue
        model = Video if identity.kind == "movie" else Episode
        content = await db.scalar(select(model).where(model.client_id == delivery.client_id, model.id == identity.content_id))
        if not content or content.status != ContentStatus.DRAFT:
            continue
        rendition = await db.scalar(select(MediaAssetRendition).where(
            MediaAssetRendition.client_id == delivery.client_id, MediaAssetRendition.id == content.media_asset_rendition_id,
            MediaAssetRendition.status == "complete", MediaAssetRendition.hls_manifest_key.is_not(None),
        ))
        if not rendition:
            continue
        content.status = ContentStatus.PUBLISHED
        identity.metadata_json = {**identity.metadata_json, "publication_complete": True}
        if identity.kind == "episode":
            series_identity = await db.scalar(select(PartnerContent).where(
                PartnerContent.client_id == delivery.client_id, PartnerContent.partner_id == delivery.partner_id,
                PartnerContent.kind == "series", PartnerContent.sku == identity.parent_sku,
            ))
            series = await db.scalar(select(Series).where(Series.client_id == delivery.client_id, Series.id == content.series_id))
            if series and series_identity and not series_identity.revoked_at and series.status == ContentStatus.DRAFT and not series_identity.metadata_json.get("publication_complete"):
                await db.flush()
                remaining = await db.scalar(select(Episode.id).where(Episode.client_id == delivery.client_id,
                    Episode.series_id == series.id, Episode.status != ContentStatus.PUBLISHED).limit(1))
                if not remaining:
                    series.status = ContentStatus.PUBLISHED
                    series_identity.metadata_json = {**series_identity.metadata_json, "publication_complete": True}
    await db.commit()


async def _process_ingests(delivery_id, client_id):
    async with AsyncSessionLocal() as db:
        delivery = await db.scalar(select(PartnerDelivery).where(PartnerDelivery.id == delivery_id, PartnerDelivery.client_id == client_id))
        if not delivery.enabled or delivery.status != "ready":
            return
        pending = (await db.scalars(select(PartnerIngest.id).where(
            PartnerIngest.client_id == delivery.client_id, PartnerIngest.delivery_id == delivery.id,
            PartnerIngest.status.in_(["pending", "retry"]),
            or_(PartnerIngest.next_attempt_at.is_(None), PartnerIngest.next_attempt_at <= datetime.now(timezone.utc)),
        ).order_by(PartnerIngest.source_modified_at).limit(3))).all()
        for ingest_id in pending:
            ingest = await db.scalar(select(PartnerIngest).where(PartnerIngest.id == ingest_id, PartnerIngest.client_id == client_id))
            try:
                async with db.begin_nested():
                    ingest.summary = await _import_package(db, delivery, ingest)
                    ingest.status = "complete"
                    ingest.error = None
                    ingest.completed_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception as error:
                await db.rollback()
                ingest = await db.scalar(select(PartnerIngest).where(PartnerIngest.id == ingest_id, PartnerIngest.client_id == client_id))
                delivery = await db.scalar(select(PartnerDelivery).where(PartnerDelivery.id == delivery_id, PartnerDelivery.client_id == client_id))
                ingest.attempts += 1
                ingest.status = "failed" if ingest.attempts >= settings.PARTNER_INGEST_MAX_ATTEMPTS else "retry"
                ingest.error = str(error)[:2000]
                ingest.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=min(3600, 30 * 2 ** ingest.attempts))
                await db.commit()
                logger.exception("Partner package failed: %s", ingest.id)


async def process_partner_deliveries():
    if not settings.PARTNER_DELIVERY_ENABLED or not settings.PARTNER_DELIVERY_PRIVATE_SOURCES_CONFIRMED:
        return
    async with AsyncSessionLocal() as db:
        identifiers = (await db.execute(select(PartnerDelivery.id, PartnerDelivery.client_id))).all()
    for delivery_id, client_id in identifiers:
        async with AsyncSessionLocal() as guard:
            lock_id = int.from_bytes(hashlib.sha256(str(delivery_id).encode()).digest()[:8], "big", signed=True)
            acquired = await guard.scalar(text("SELECT pg_try_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})
            if not acquired:
                continue
            try:
                async with AsyncSessionLocal() as db:
                    delivery = await db.scalar(select(PartnerDelivery).where(PartnerDelivery.id == delivery_id, PartnerDelivery.client_id == client_id).with_for_update())
                    partner = await db.scalar(select(ContentPartner).where(ContentPartner.id == delivery.partner_id, ContentPartner.client_id == client_id))
                    if partner.status == "inactive" and delivery.enabled:
                        delivery.enabled, delivery.status = False, "pending"
                    if delivery.status in {"pending", "retry"} and (not delivery.next_attempt_at or delivery.next_attempt_at <= datetime.now(timezone.utc)):
                        try:
                            slug = await db.scalar(select(Client.slug).where(Client.id == client_id))
                            result = await asyncio.to_thread(provision_partner_storage, delivery, slug)
                            delivery.queue_url, delivery.queue_arn = result["queue_url"], result["queue_arn"]
                            delivery.status, delivery.error = ("ready" if delivery.enabled else "disabled"), None
                        except Exception as error:
                            delivery.attempts += 1
                            delivery.error = str(error)[:2000]
                            delivery.status = "failed" if delivery.attempts >= settings.PARTNER_INGEST_MAX_ATTEMPTS else "retry"
                            delivery.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=min(3600, 30 * 2 ** delivery.attempts))
                        await db.commit()
                    if delivery.status != "ready" or not delivery.enabled:
                        continue
                    if delivery.options.get("metadata_format", "filmhub_csv_3") == "none":
                        continue
                    await _receive_events(db, delivery)
                    await _reconcile(db, delivery)
                await _process_ingests(delivery_id, client_id)
                async with AsyncSessionLocal() as db:
                    delivery = await db.scalar(select(PartnerDelivery).where(PartnerDelivery.id == delivery_id, PartnerDelivery.client_id == client_id))
                    await _sync_video_renditions(db, delivery)
                    await _publish_ready(db, delivery)
            except Exception:
                logger.exception("Partner delivery worker failed: %s", delivery_id)
            finally:
                await guard.rollback()