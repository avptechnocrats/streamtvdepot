"""
Managed live pipeline (AWS Elemental MediaLive → MediaPackage v2 → CloudFront, MediaTailor for ads).

    OBS ──RTMP──▶ MediaLive (ABR ladder, 2 pipelines, SCTE-35) ──CMAF ingest──▶ MediaPackage v2
        ──▶ CloudFront (OAC, signed cookies) ──▶ [MediaTailor SSAI] ──▶ player

Per channel this module owns: MediaLive input + channel, MediaPackage channel with a `live` (CMAF,
HLS + LL-HLS) and a `vod` (TS, harvest-only) origin endpoint, and optionally a MediaTailor config.
All functions are synchronous boto3 calls — run them in a thread pool.
"""

from __future__ import annotations

import base64
import json
import logging
import secrets
import time
import uuid
from datetime import datetime
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from app.core.config import settings

logger = logging.getLogger(__name__)

_BOTO_CONFIG = Config(
    retries={"max_attempts": 5, "mode": "standard"},
    connect_timeout=5,
    read_timeout=30,
)

LIVE_ENDPOINT = "live"
VOD_ENDPOINT = "vod"
HLS_MANIFEST = "index"
LL_HLS_MANIFEST = "ll"
MANIFEST_WINDOW_SECONDS = 120
SCTE_TICKS_PER_SECOND = 90_000

# 4-rung H.264 ladder. QVBR keeps quality steady while capping bitrate for CDN cost.
_LADDER = [
    {"name": "1080p", "width": 1920, "height": 1080, "max_bitrate": 5_000_000, "qvbr": 7},
    {"name": "720p", "width": 1280, "height": 720, "max_bitrate": 3_000_000, "qvbr": 7},
    {"name": "480p", "width": 854, "height": 480, "max_bitrate": 1_400_000, "qvbr": 7},
    {"name": "360p", "width": 640, "height": 360, "max_bitrate": 800_000, "qvbr": 6},
]
_AUDIO_NAME = "audio_aac_128"

_SCTE_FILTER = [
    "SPLICE_INSERT",
    "BREAK",
    "PROVIDER_ADVERTISEMENT",
    "DISTRIBUTOR_ADVERTISEMENT",
    "PROVIDER_PLACEMENT_OPPORTUNITY",
    "DISTRIBUTOR_PLACEMENT_OPPORTUNITY",
]

DEFAULT_OPTIONS: dict[str, Any] = {
    "ads_enabled": False,
    "ad_decision_server_url": None,
    "preroll_seconds": 0,
    "record_vod": True,
}


class LiveAwsError(RuntimeError):
    """Raised for misconfiguration or AWS failures; message is safe to show to admins."""


# ─── Configuration ──────────────────────────────────────────────────────────

def is_available() -> bool:
    """True when every setting the managed pipeline needs is present."""
    return not missing_configuration()


def default_pipeline() -> str:
    """Engine preselected for new RTMP channels: the configured default, if it can actually run."""
    return "aws" if settings.LIVE_PIPELINE == "aws" and is_available() else "legacy"


def missing_configuration() -> list[str]:
    checks = {
        "AWS_ACCESS_KEY_ID": settings.AWS_ACCESS_KEY_ID,
        "AWS_SECRET_ACCESS_KEY": settings.AWS_SECRET_ACCESS_KEY,
        "MEDIALIVE_ROLE_ARN": settings.MEDIALIVE_ROLE_ARN,
        "LIVE_CLOUDFRONT_DOMAIN": settings.LIVE_CLOUDFRONT_DOMAIN,
        "LIVE_CF_KEY_PAIR_ID": settings.LIVE_CF_KEY_PAIR_ID,
        "LIVE_CF_PRIVATE_KEY_PEM": settings.LIVE_CF_PRIVATE_KEY_PEM,
        "LIVE_CF_COOKIE_DOMAIN": settings.LIVE_CF_COOKIE_DOMAIN,
    }
    missing = [key for key, value in checks.items() if not value]
    if not settings.MEDIALIVE_INPUT_SECURITY_GROUP_ID and not settings.LIVE_INGEST_ALLOWED_CIDRS:
        missing.append("LIVE_INGEST_ALLOWED_CIDRS (or MEDIALIVE_INPUT_SECURITY_GROUP_ID)")
    return missing


def require_configured() -> None:
    missing = missing_configuration()
    if missing:
        raise LiveAwsError(f"Managed live pipeline is not configured. Missing: {', '.join(missing)}")


def normalize_options(raw: dict | None) -> dict[str, Any]:
    options = {**DEFAULT_OPTIONS, **(raw or {})}
    options["ads_enabled"] = bool(options["ads_enabled"]) and settings.LIVE_MEDIATAILOR_ENABLED
    options["preroll_seconds"] = max(0, min(int(options["preroll_seconds"] or 0), 60))
    options["record_vod"] = bool(options["record_vod"])
    return options


def resource_name(stream_id: uuid.UUID | str) -> str:
    return f"{settings.LIVE_RESOURCE_PREFIX}-{uuid.UUID(str(stream_id)).hex[:16]}"


def live_region() -> str:
    return settings.LIVE_AWS_REGION or settings.AWS_REGION


def _client(service: str):
    return boto3.client(
        service,
        region_name=live_region(),
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=_BOTO_CONFIG,
    )


def _code(exc: ClientError) -> str:
    return exc.response.get("Error", {}).get("Code", "")


def _tags(stream_id: uuid.UUID | str) -> dict[str, str]:
    return {"app": "streamtvdepot", "live_stream_id": str(stream_id)}


# ─── MediaPackage v2 ────────────────────────────────────────────────────────

def _ensure_channel_group(mp) -> str:
    group = settings.MEDIAPACKAGE_CHANNEL_GROUP
    try:
        return mp.get_channel_group(ChannelGroupName=group)["EgressDomain"]
    except ClientError as exc:
        if _code(exc) != "ResourceNotFoundException":
            raise
    try:
        return mp.create_channel_group(ChannelGroupName=group)["EgressDomain"]
    except ClientError as exc:
        if _code(exc) != "ConflictException":
            raise
        return mp.get_channel_group(ChannelGroupName=group)["EgressDomain"]


def _ensure_mp_channel(mp, name: str, stream_id) -> dict:
    group = settings.MEDIAPACKAGE_CHANNEL_GROUP
    try:
        channel = mp.create_channel(
            ChannelGroupName=group,
            ChannelName=name,
            InputType="CMAF",
            Description=f"StreamTVDepot live {stream_id}",
            Tags=_tags(stream_id),
        )
    except ClientError as exc:
        if _code(exc) != "ConflictException":
            raise
        channel = mp.get_channel(ChannelGroupName=group, ChannelName=name)

    # Only the MediaLive role may publish to this channel.
    mp.put_channel_policy(
        ChannelGroupName=group,
        ChannelName=name,
        Policy=json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "AllowMediaLiveIngest",
                "Effect": "Allow",
                "Principal": {"AWS": settings.MEDIALIVE_ROLE_ARN},
                "Action": "mediapackagev2:PutObject",
                "Resource": channel["Arn"],
            }],
        }),
    )
    return channel


def _hls_manifest(name: str) -> dict:
    return {
        "ManifestName": name,
        "ManifestWindowSeconds": MANIFEST_WINDOW_SECONDS,
        "ProgramDateTimeIntervalSeconds": 60,
        "ScteHls": {"AdMarkerHls": settings.LIVE_HLS_AD_MARKER},
    }


def _ensure_origin_endpoint(mp, channel_name: str, endpoint: str, container: str) -> dict:
    group = settings.MEDIAPACKAGE_CHANNEL_GROUP
    params: dict[str, Any] = {
        "ChannelGroupName": group,
        "ChannelName": channel_name,
        "OriginEndpointName": endpoint,
        "ContainerType": container,
        "StartoverWindowSeconds": settings.LIVE_DVR_WINDOW_SECONDS,
        "Segment": {
            "SegmentDurationSeconds": settings.LIVE_SEGMENT_SECONDS,
            "SegmentName": "segment",
            "Scte": {"ScteFilter": _SCTE_FILTER, "ScteInSegments": "NONE"},
        },
        "HlsManifests": [_hls_manifest(HLS_MANIFEST)],
    }
    if container == "CMAF":
        # LL-HLS needs CMAF; it serves ad-free direct playback with the lowest latency.
        params["LowLatencyHlsManifests"] = [_hls_manifest(LL_HLS_MANIFEST)]
    try:
        return mp.create_origin_endpoint(**params)
    except ClientError as exc:
        if _code(exc) != "ConflictException":
            raise
        return mp.get_origin_endpoint(
            ChannelGroupName=group, ChannelName=channel_name, OriginEndpointName=endpoint
        )


def _allow_cloudfront_egress(mp, channel_name: str, endpoint: dict) -> None:
    """Origin access control: only our CloudFront distribution may read the live endpoint."""
    if not settings.LIVE_CLOUDFRONT_DISTRIBUTION_ARN:
        return
    mp.put_origin_endpoint_policy(
        ChannelGroupName=settings.MEDIAPACKAGE_CHANNEL_GROUP,
        ChannelName=channel_name,
        OriginEndpointName=LIVE_ENDPOINT,
        Policy=json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "AllowCloudFrontOAC",
                "Effect": "Allow",
                "Principal": {"Service": "cloudfront.amazonaws.com"},
                "Action": ["mediapackagev2:GetObject", "mediapackagev2:GetHeadObject"],
                "Resource": endpoint["Arn"],
                "Condition": {"StringEquals": {"AWS:SourceArn": settings.LIVE_CLOUDFRONT_DISTRIBUTION_ARN}},
            }],
        }),
    )


def _manifest_path(endpoint: dict, key: str, manifest_name: str) -> str | None:
    for item in endpoint.get(key, []) or []:
        if item.get("ManifestName") == manifest_name and item.get("Url"):
            return urlparse(item["Url"]).path
    return None


# ─── MediaLive ──────────────────────────────────────────────────────────────

def _ensure_input_security_group(ml, stream_id, created: list) -> str:
    if settings.MEDIALIVE_INPUT_SECURITY_GROUP_ID:
        return settings.MEDIALIVE_INPUT_SECURITY_GROUP_ID
    group = ml.create_input_security_group(
        WhitelistRules=[{"Cidr": cidr} for cidr in settings.LIVE_INGEST_ALLOWED_CIDRS],
        Tags=_tags(stream_id),
    )["SecurityGroup"]
    created.append(("security_group", group["Id"]))
    return group["Id"]


def _create_input(ml, name: str, stream_id, rtmp_key: str, sg_id: str, created: list) -> dict:
    # Two destinations (one per pipeline) for STANDARD class; each needs a distinct app name.
    apps = ["a", "b"] if settings.MEDIALIVE_CHANNEL_CLASS == "STANDARD" else ["a"]
    created_input = ml.create_input(
        Name=name,
        Type="RTMP_PUSH",
        InputSecurityGroups=[sg_id],
        Destinations=[{"StreamName": f"{app}/{rtmp_key}"} for app in apps],
        RequestId=uuid.uuid4().hex,
        Tags=_tags(stream_id),
    )["Input"]
    created.append(("input", created_input["Id"]))
    return created_input


def _video_description(rung: dict) -> dict:
    return {
        "Name": f"video_{rung['name']}",
        "Width": rung["width"],
        "Height": rung["height"],
        "RespondToAfd": "NONE",
        "ScalingBehavior": "DEFAULT",
        "CodecSettings": {
            "H264Settings": {
                "RateControlMode": "QVBR",
                "QvbrQualityLevel": rung["qvbr"],
                "MaxBitrate": rung["max_bitrate"],
                "Profile": "HIGH",
                "Level": "H264_LEVEL_AUTO",
                "ParControl": "INITIALIZE_FROM_SOURCE",
                "FramerateControl": "INITIALIZE_FROM_SOURCE",
                "GopSize": float(settings.LIVE_SEGMENT_SECONDS),
                "GopSizeUnits": "SECONDS",
                "GopClosedCadence": 1,
                "GopNumBFrames": 2,
                "SubgopLength": "FIXED",
                "SceneChangeDetect": "DISABLED",  # identical GOP boundaries across rungs keep ABR switches seamless
                "ScanType": "PROGRESSIVE",
                "EntropyEncoding": "CABAC",
                "AdaptiveQuantization": "HIGH",
                "SpatialAq": "ENABLED",
                "TemporalAq": "ENABLED",
                "AfdSignaling": "NONE",
                "TimecodeInsertion": "DISABLED",
            }
        },
    }


def _encoder_settings() -> dict:
    return {
        "TimecodeConfig": {"Source": "EMBEDDED"},
        "VideoDescriptions": [_video_description(rung) for rung in _LADDER],
        "AudioDescriptions": [{
            "Name": _AUDIO_NAME,
            "AudioSelectorName": "default",
            "AudioTypeControl": "FOLLOW_INPUT",
            "CodecSettings": {
                "AacSettings": {
                    "Bitrate": 128000,
                    "CodingMode": "CODING_MODE_2_0",
                    "InputType": "NORMAL",
                    "Profile": "LC",
                    "RateControlMode": "CBR",
                    "RawFormat": "NONE",
                    "SampleRate": 48000,
                    "Spec": "MPEG4",
                }
            },
        }],
        "OutputGroups": [{
            "Name": "mediapackage-v2",
            "OutputGroupSettings": {
                "CmafIngestGroupSettings": {
                    "Destination": {"DestinationRefId": "mpv2"},
                    "SegmentLength": settings.LIVE_SEGMENT_SECONDS,
                    "SegmentLengthUnits": "SECONDS",
                    "Scte35Type": "SCTE_35_WITHOUT_SEGMENTATION",
                }
            },
            "Outputs": [
                {
                    "OutputName": rung["name"],
                    "VideoDescriptionName": f"video_{rung['name']}",
                    "AudioDescriptionNames": [_AUDIO_NAME],
                    "OutputSettings": {"CmafIngestOutputSettings": {"NameModifier": f"_{rung['name']}"}},
                }
                for rung in _LADDER
            ],
        }],
    }


def _create_channel(ml, name: str, stream_id, input_id: str, ingest_urls: list[str], created: list) -> dict:
    channel = ml.create_channel(
        Name=name,
        ChannelClass=settings.MEDIALIVE_CHANNEL_CLASS,
        RoleArn=settings.MEDIALIVE_ROLE_ARN,
        LogLevel="WARNING",
        RequestId=uuid.uuid4().hex,
        InputSpecification={"Codec": "AVC", "Resolution": "HD", "MaximumBitrate": "MAX_20_MBPS"},
        InputAttachments=[{
            "InputAttachmentName": "primary",
            "InputId": input_id,
            "InputSettings": {
                "SourceEndBehavior": "CONTINUE",
                "InputFilter": "AUTO",
                "FilterStrength": 1,
                "AudioSelectors": [{"Name": "default"}],
            },
        }],
        Destinations=[{"Id": "mpv2", "Settings": [{"Url": url} for url in ingest_urls]}],
        EncoderSettings=_encoder_settings(),
        Tags=_tags(stream_id),
    )["Channel"]
    created.append(("channel", channel["Id"]))
    return channel


# ─── MediaTailor ────────────────────────────────────────────────────────────

def ad_decision_server_url(stream_id, client_slug: str, options: dict) -> str:
    custom = options.get("ad_decision_server_url") or settings.LIVE_AD_DECISION_SERVER_URL
    if custom:
        return custom
    base = settings.BACKEND_PUBLIC_URL.rstrip("/")
    prefix = settings.API_V1_PREFIX.strip("/")
    # [session.*] macros are expanded by MediaTailor on every ad request.
    return (
        f"{base}/{prefix}/public/playback/live-stream/{stream_id}/vast.xml"
        f"?slug={client_slug}&session_id=[session.id]&avail_ms=[session.avail_duration_ms]"
    )


def _upsert_mediatailor(mt, config_name: str, name: str, cdn_host: str, stream_id, client_slug: str, options: dict) -> dict:
    """One MediaTailor config per viewer-facing CDN host: it rewrites content segment URLs to that host."""
    ads_url = ad_decision_server_url(stream_id, client_slug, options)
    params: dict[str, Any] = {
        "Name": config_name,
        "AdDecisionServerUrl": ads_url,
        "VideoContentSourceUrl": (
            f"https://{cdn_host}/out/v1/"
            f"{settings.MEDIAPACKAGE_CHANNEL_GROUP}/{name}/{LIVE_ENDPOINT}"
        ),
        "InsertionMode": "STITCHED_ONLY",
        "PersonalizationThresholdSeconds": 2,
        "ManifestProcessingRules": {"AdMarkerPassthrough": {"Enabled": False}},
        "Tags": _tags(stream_id),
    }
    if settings.LIVE_SLATE_AD_URL:
        params["SlateAdUrl"] = settings.LIVE_SLATE_AD_URL
    if settings.LIVE_MEDIATAILOR_TRANSCODE_PROFILE:
        params["TranscodeProfileName"] = settings.LIVE_MEDIATAILOR_TRANSCODE_PROFILE
    if options.get("preroll_seconds"):
        params["LivePreRollConfiguration"] = {
            "AdDecisionServerUrl": ads_url,
            "MaxDurationSeconds": int(options["preroll_seconds"]),
        }
    result = mt.put_playback_configuration(**params)
    return {
        "name": config_name,
        "manifest_prefix": result["HlsConfiguration"]["ManifestEndpointPrefix"],
    }


def _upsert_mediatailor_hosts(
    mt, name: str, stream_id, client_slug: str, options: dict, tenant_domain: str | None
) -> dict[str, dict]:
    """MediaTailor configs keyed by CDN host: the shared host plus the tenant's own host, if any."""
    configs: dict[str, dict] = {}
    for host in cdn_hosts(tenant_domain):
        # Every config name contains `name`, so one signed-cookie policy covers all of them.
        config_name = name if host == settings.LIVE_CLOUDFRONT_DOMAIN else f"{name}-t"
        configs[host] = _upsert_mediatailor(mt, config_name, name, host, stream_id, client_slug, options)
    return configs


def _mediatailor_configs(state: dict) -> dict[str, dict]:
    """MediaTailor configs by CDN host; tolerates the older single-config state shape."""
    configs = state.get("mediatailor") or {}
    if "manifest_prefix" in configs:
        return {settings.LIVE_CLOUDFRONT_DOMAIN: configs}
    return configs


# ─── Provision / lifecycle ──────────────────────────────────────────────────

def provision(
    *,
    stream_id: uuid.UUID | str,
    client_slug: str,
    rtmp_key: str,
    options: dict | None,
    tenant_domain: str | None = None,
) -> dict:
    """Create every AWS resource for one channel. Returns the `aws_live` state to persist."""
    require_configured()
    options = normalize_options(options)
    name = resource_name(stream_id)
    created: list[tuple[str, str]] = []  # MediaLive resources are not name-idempotent, so undo them on failure

    mp, ml, mt = _client("mediapackagev2"), _client("medialive"), _client("mediatailor")
    try:
        egress_domain = _ensure_channel_group(mp)
        mp_channel = _ensure_mp_channel(mp, name, stream_id)
        live_ep = _ensure_origin_endpoint(mp, name, LIVE_ENDPOINT, "CMAF")
        _ensure_origin_endpoint(mp, name, VOD_ENDPOINT, "TS")
        _allow_cloudfront_egress(mp, name, live_ep)

        sg_id = _ensure_input_security_group(ml, stream_id, created)
        ml_input = _create_input(ml, name, stream_id, rtmp_key, sg_id, created)
        ingest_urls = [ep["Url"] for ep in mp_channel["IngestEndpoints"]]
        if settings.MEDIALIVE_CHANNEL_CLASS == "SINGLE_PIPELINE":
            ingest_urls = ingest_urls[:1]
        ml_channel = _create_channel(ml, name, stream_id, ml_input["Id"], ingest_urls, created)

        mediatailor = None
        if options["ads_enabled"]:
            mediatailor = _upsert_mediatailor_hosts(mt, name, stream_id, client_slug, options, tenant_domain)

        ml.get_waiter("channel_created").wait(
            ChannelId=ml_channel["Id"], WaiterConfig={"Delay": 5, "MaxAttempts": 24}
        )
    except (BotoCoreError, ClientError) as exc:
        _rollback(ml, created)
        raise LiveAwsError(f"AWS provisioning failed: {exc}") from exc
    except Exception:
        _rollback(ml, created)
        raise

    return {
        "status": "ready",
        "error": None,
        "name": name,
        "options": options,
        "channel_group": settings.MEDIAPACKAGE_CHANNEL_GROUP,
        "egress_domain": egress_domain,
        "live_manifest_path": _manifest_path(live_ep, "HlsManifests", HLS_MANIFEST),
        "ll_manifest_path": _manifest_path(live_ep, "LowLatencyHlsManifests", LL_HLS_MANIFEST),
        "medialive_input_id": ml_input["Id"],
        "medialive_channel_id": ml_channel["Id"],
        "input_security_group_id": next((rid for kind, rid in created if kind == "security_group"), None),
        "ingest_urls": [dest["Url"] for dest in ml_input.get("Destinations", [])],
        "mediatailor": mediatailor,
        "channel_state": "IDLE",
    }


def _rollback(ml, created: list[tuple[str, str]]) -> None:
    for kind, resource_id in reversed(created):
        try:
            if kind == "channel":
                ml.delete_channel(ChannelId=resource_id)
                ml.get_waiter("channel_deleted").wait(ChannelId=resource_id, WaiterConfig={"Delay": 5, "MaxAttempts": 24})
            elif kind == "input":
                ml.delete_input(InputId=resource_id)
                ml.get_waiter("input_deleted").wait(InputId=resource_id, WaiterConfig={"Delay": 5, "MaxAttempts": 12})
            elif kind == "security_group":
                ml.delete_input_security_group(InputSecurityGroupId=resource_id)
        except Exception:
            logger.exception("Live rollback could not delete %s %s", kind, resource_id)


def update_ads(*, stream_id, client_slug: str, state: dict, options: dict, tenant_domain: str | None = None) -> dict:
    """Apply changed ad options: upsert (or leave) the MediaTailor configs. Returns new state."""
    require_configured()
    options = normalize_options(options)
    new_state = {**state, "options": options}
    name = state["name"]
    try:
        if options["ads_enabled"]:
            new_state["mediatailor"] = _upsert_mediatailor_hosts(
                _client("mediatailor"), name, stream_id, client_slug, options, tenant_domain
            )
        else:
            new_state["mediatailor"] = None
    except (BotoCoreError, ClientError) as exc:
        raise LiveAwsError(f"Could not update ad configuration: {exc}") from exc
    return new_state


def start_channel(state: dict) -> None:
    try:
        _client("medialive").start_channel(ChannelId=state["medialive_channel_id"])
    except ClientError as exc:
        if _code(exc) != "ConflictException":
            raise LiveAwsError(f"Could not start channel: {exc}") from exc
    except BotoCoreError as exc:
        raise LiveAwsError(f"Could not start channel: {exc}") from exc


def stop_channel(state: dict) -> None:
    try:
        _client("medialive").stop_channel(ChannelId=state["medialive_channel_id"])
    except ClientError as exc:
        if _code(exc) != "ConflictException":
            raise LiveAwsError(f"Could not stop channel: {exc}") from exc
    except BotoCoreError as exc:
        raise LiveAwsError(f"Could not stop channel: {exc}") from exc


def describe_channel_state(state: dict) -> str:
    try:
        return _client("medialive").describe_channel(ChannelId=state["medialive_channel_id"])["State"]
    except (BotoCoreError, ClientError) as exc:
        raise LiveAwsError(f"Could not read channel state: {exc}") from exc


def rotate_input_key(state: dict, rtmp_key: str) -> list[str]:
    """Point the RTMP input at a new stream key. The channel must be stopped. Returns new ingest URLs."""
    ml = _client("medialive")
    apps = ["a", "b"] if len(state.get("ingest_urls") or []) > 1 else ["a"]
    try:
        ml.update_input(
            InputId=state["medialive_input_id"],
            Destinations=[{"StreamName": f"{app}/{rtmp_key}"} for app in apps],
        )
        described = ml.describe_input(InputId=state["medialive_input_id"])
    except (BotoCoreError, ClientError) as exc:
        raise LiveAwsError(f"Could not rotate stream key: {exc}") from exc
    return [dest["Url"] for dest in described.get("Destinations", [])]


def signal_ad_break(state: dict, *, duration_seconds: int) -> int:
    """Insert a SCTE-35 splice_insert now; MediaPackage/MediaTailor turn it into an ad break."""
    max_seconds = settings.LIVE_AD_MAX_BREAK_SECONDS
    if not 1 <= duration_seconds <= max_seconds:
        raise LiveAwsError(f"Ad break must be between 1 and {max_seconds} seconds")
    event_id = secrets.randbelow(2**31 - 1) + 1
    try:
        _client("medialive").batch_update_schedule(
            ChannelId=state["medialive_channel_id"],
            Creates={"ScheduleActions": [{
                "ActionName": f"adbreak-{event_id}",
                "ScheduleActionStartSettings": {"ImmediateModeScheduleActionStartSettings": {}},
                "ScheduleActionSettings": {
                    "Scte35SpliceInsertSettings": {
                        "SpliceEventId": event_id,
                        "Duration": duration_seconds * SCTE_TICKS_PER_SECOND,
                    }
                },
            }]},
        )
    except (BotoCoreError, ClientError) as exc:
        raise LiveAwsError(f"Could not signal ad break (is the channel running?): {exc}") from exc
    return event_id


def delete_resources(state: dict) -> None:
    """Tear everything down. The MediaLive channel must already be stopped (IDLE)."""
    ml, mp, mt = _client("medialive"), _client("mediapackagev2"), _client("mediatailor")
    group, name = state.get("channel_group"), state.get("name")
    steps: list[tuple[str, Any]] = []

    channel_id = state.get("medialive_channel_id")
    if channel_id:
        def _delete_channel():
            ml.delete_channel(ChannelId=channel_id)
            ml.get_waiter("channel_deleted").wait(ChannelId=channel_id, WaiterConfig={"Delay": 5, "MaxAttempts": 24})
        steps.append(("medialive channel", _delete_channel))
    input_id = state.get("medialive_input_id")
    if input_id:
        def _delete_input():
            ml.delete_input(InputId=input_id)
            ml.get_waiter("input_deleted").wait(InputId=input_id, WaiterConfig={"Delay": 5, "MaxAttempts": 12})
        steps.append(("medialive input", _delete_input))
    sg_id = state.get("input_security_group_id")
    if sg_id:
        steps.append(("input security group", lambda: ml.delete_input_security_group(InputSecurityGroupId=sg_id)))
    for config in _mediatailor_configs(state).values():
        config_name = config["name"]
        steps.append((
            f"mediatailor config {config_name}",
            lambda config_name=config_name: mt.delete_playback_configuration(Name=config_name),
        ))
    if group and name:
        for endpoint in (LIVE_ENDPOINT, VOD_ENDPOINT):
            steps.append((
                f"origin endpoint {endpoint}",
                lambda endpoint=endpoint: mp.delete_origin_endpoint(
                    ChannelGroupName=group, ChannelName=name, OriginEndpointName=endpoint
                ),
            ))
        steps.append(("mediapackage channel", lambda: mp.delete_channel(ChannelGroupName=group, ChannelName=name)))

    failures: list[str] = []
    for label, step in steps:
        try:
            step()
        except ClientError as exc:
            if _code(exc) not in {"ResourceNotFoundException", "NotFoundException"}:
                logger.exception("Live cleanup failed: %s", label)
                failures.append(label)
        except Exception:
            logger.exception("Live cleanup failed: %s", label)
            failures.append(label)
    if failures:
        raise LiveAwsError(f"Could not delete: {', '.join(failures)}")


# ─── Ingest details for admins ──────────────────────────────────────────────

def ingest_endpoints(state: dict, rtmp_key: str) -> list[dict[str, str]]:
    """Server URL + stream key pairs for the encoder (primary first)."""
    endpoints = []
    for url in state.get("ingest_urls") or []:
        server, _, key = url.rpartition("/")
        endpoints.append({"server": server, "stream_key": key or rtmp_key})
    return endpoints


# ─── Recording → VOD (MediaPackage harvest) ─────────────────────────────────

def vod_destination(client_slug: str, video_id: uuid.UUID | str) -> tuple[str, str]:
    bucket = settings.MEDIACONVERT_OUTPUT_BUCKET or settings.AWS_S3_BUCKET
    prefix = settings.MEDIACONVERT_OUTPUT_PREFIX.strip("/")
    return bucket, f"{prefix}/{client_slug}/{video_id}"


def start_harvest(
    state: dict,
    *,
    client_slug: str,
    video_id: uuid.UUID | str,
    start: datetime,
    end: datetime,
) -> dict:
    """Export [start, end] of the live channel as HLS VOD into S3 without re-encoding."""
    if end <= start:
        raise LiveAwsError("Harvest end must be after start")
    bucket, path = vod_destination(client_slug, video_id)
    if not bucket:
        raise LiveAwsError("No S3 bucket configured for VOD output")
    job_name = f"{state['name']}-{int(time.time())}"
    try:
        _client("mediapackagev2").create_harvest_job(
            ChannelGroupName=state["channel_group"],
            ChannelName=state["name"],
            OriginEndpointName=VOD_ENDPOINT,
            HarvestJobName=job_name,
            HarvestedManifests={"HlsManifests": [{"ManifestName": HLS_MANIFEST}]},
            ScheduleConfiguration={"StartTime": start, "EndTime": end},
            Destination={"S3Destination": {"BucketName": bucket, "DestinationPath": path}},
            Tags=_tags(video_id),
        )
    except (BotoCoreError, ClientError) as exc:
        raise LiveAwsError(f"Could not start VOD export: {exc}") from exc
    return {"job_name": job_name, "bucket": bucket, "path": path}


def get_harvest_status(state: dict, job_name: str) -> tuple[str, str | None]:
    try:
        job = _client("mediapackagev2").get_harvest_job(
            ChannelGroupName=state["channel_group"],
            ChannelName=state["name"],
            OriginEndpointName=VOD_ENDPOINT,
            HarvestJobName=job_name,
        )
    except (BotoCoreError, ClientError) as exc:
        raise LiveAwsError(f"Could not read VOD export status: {exc}") from exc
    return job["Status"], job.get("ErrorMessage")


def find_harvested_manifest_key(bucket: str, path: str) -> str | None:
    """Locate the master playlist the harvest wrote under `path`."""
    s3 = _client("s3")
    candidates: list[str] = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=f"{path}/"):
        candidates.extend(
            obj["Key"] for obj in page.get("Contents", []) if obj["Key"].endswith(f"{HLS_MANIFEST}.m3u8")
        )
    return min(candidates, key=len) if candidates else None


# ─── Viewer playback + CDN authorization ────────────────────────────────────

def _cf_encode(data: bytes) -> str:
    return base64.b64encode(data).decode().replace("+", "-").replace("=", "_").replace("/", "~")


@lru_cache(maxsize=1)
def _cf_private_key():
    pem = settings.LIVE_CF_PRIVATE_KEY_PEM.replace("\\n", "\n").encode()
    return serialization.load_pem_private_key(pem, password=None)


def tenant_cdn(tenant_domain: str | None) -> tuple[str, str] | None:
    """(video host, cookie domain) for a tenant's own domain, or None when it has no mapped host."""
    domain = (tenant_domain or "").strip().lower().removeprefix("www.")
    host = (settings.LIVE_TENANT_CDN_DOMAINS.get(domain) or "").strip().lower()
    # Cookies set on the tenant domain only reach hosts beneath it; anything else is a misconfiguration.
    if not domain or not host.endswith(f".{domain}"):
        return None
    return host, f".{domain}"


def cdn_hosts(tenant_domain: str | None) -> list[str]:
    """Viewer-facing CDN hosts a channel must serve: the shared one plus the tenant's own, if mapped."""
    hosts = [settings.LIVE_CLOUDFRONT_DOMAIN]
    tenant = tenant_cdn(tenant_domain)
    if tenant:
        hosts.append(tenant[0])
    return hosts


def resolve_viewer_cdn(state: dict, page_origin: str | None, tenant_domain: str | None) -> tuple[str, str]:
    """
    Pick (CDN host, cookie domain) for the page the viewer is on. Pages on the tenant's own domain get
    the tenant's first-party host (the only way their browser accepts the cookies); every other page,
    including *.streamtvdepot.com and preview sites, uses the shared host.
    """
    shared = (settings.LIVE_CLOUDFRONT_DOMAIN, settings.LIVE_CF_COOKIE_DOMAIN)
    tenant = tenant_cdn(tenant_domain)
    page_host = (urlparse(page_origin or "").hostname or "").lower()
    if not tenant or not page_host:
        return shared
    domain = tenant[1][1:]
    if page_host != domain and not page_host.endswith(f".{domain}"):
        return shared
    ads_enabled = bool((state.get("options") or {}).get("ads_enabled"))
    if ads_enabled and tenant[0] not in _mediatailor_configs(state):
        return shared  # ad config for this host not provisioned yet
    return tenant


def cdn_cookies(state: dict, cdn_host: str | None = None, cookie_domain: str | None = None) -> dict:
    """
    CloudFront signed cookies scoped to this channel's paths (MediaPackage and MediaTailor URLs
    both embed the resource name). Segments are protected; the player refreshes before `expires`.
    """
    cdn_host = cdn_host or settings.LIVE_CLOUDFRONT_DOMAIN
    if not (cdn_host and settings.LIVE_CF_KEY_PAIR_ID and settings.LIVE_CF_PRIVATE_KEY_PEM):
        raise LiveAwsError("CloudFront signing is not configured")
    expires = int(time.time()) + settings.LIVE_CF_COOKIE_TTL_SECONDS
    policy = json.dumps(
        {"Statement": [{
            "Resource": f"https://{cdn_host}/*{state['name']}*",
            "Condition": {"DateLessThan": {"AWS:EpochTime": expires}},
        }]},
        separators=(",", ":"),
    ).encode()
    signature = _cf_private_key().sign(policy, padding.PKCS1v15(), hashes.SHA1())  # CloudFront requires RSA-SHA1
    return {
        "domain": cookie_domain or settings.LIVE_CF_COOKIE_DOMAIN,
        "expires": expires,
        "cookies": {
            "CloudFront-Policy": _cf_encode(policy),
            "CloudFront-Signature": _cf_encode(signature),
            "CloudFront-Key-Pair-Id": settings.LIVE_CF_KEY_PAIR_ID,
        },
    }


def playback_url(state: dict, cdn_host: str | None = None) -> str | None:
    """CDN URL for viewers: MediaTailor session manifest when ads are on, else LL-HLS."""
    cdn_host = cdn_host or settings.LIVE_CLOUDFRONT_DOMAIN
    cdn = f"https://{cdn_host}"
    mediatailor = _mediatailor_configs(state).get(cdn_host)
    if mediatailor and (state.get("options") or {}).get("ads_enabled"):
        prefix = urlparse(mediatailor["manifest_prefix"])
        return f"{cdn}{prefix.path.rstrip('/')}/{HLS_MANIFEST}.m3u8"
    path = state.get("ll_manifest_path") or state.get("live_manifest_path")
    return f"{cdn}{path}" if path else None
