"""
AWS MediaConvert – ABR HLS transcoding utilities.

Produces a 4-rung adaptive bitrate (ABR) HLS package:
  1080p  6 Mbps
   720p  3 Mbps
   540p  1.5 Mbps
   360p  800 kbps

Each rendition is stored under:
  s3://{output_bucket}/{output_prefix}/{client_slug}/{video_id}/

AES-128 encryption is optionally applied when drm_key_hex and
drm_key_url are passed; the key is baked into every media segment
and the #EXT-X-KEY URI points to this platform's key-delivery endpoint.

Requires:
  - MEDIACONVERT_ROLE_ARN  (IAM role with MediaConvert + S3 access)
  - MEDIACONVERT_QUEUE_ARN (can be the string "Default")
  - MEDIACONVERT_OUTPUT_BUCKET / MEDIACONVERT_OUTPUT_PREFIX

Optional:
  - MEDIACONVERT_ENDPOINT  if not set, auto-discovered via describe_endpoints()
    and cached in memory for the process lifetime.
"""

import logging
import uuid
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Endpoint auto-discovery cache ───────────────────────────────────────────

_cached_endpoint: str | None = None


def _resolve_endpoint() -> str:
    """
    Return the account-specific MediaConvert endpoint URL.

    Uses MEDIACONVERT_ENDPOINT env var when set; otherwise calls
    describe_endpoints() once and caches the result in-process.
    """
    global _cached_endpoint

    if settings.MEDIACONVERT_ENDPOINT:
        return settings.MEDIACONVERT_ENDPOINT

    if _cached_endpoint:
        return _cached_endpoint

    # Discovery client uses the generic regional endpoint (no endpoint_url)
    discovery = boto3.client(
        "mediaconvert",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )
    response = discovery.describe_endpoints()
    endpoint = response["Endpoints"][0]["Url"]
    _cached_endpoint = endpoint
    logger.info("Auto-discovered MediaConvert endpoint: %s", endpoint)
    return endpoint

# ─── ABR bitrate ladder ───────────────────────────────────────────────────────

_RENDITIONS = [
    {"height": 1080, "width": 1920, "video_bitrate": 6_000_000, "audio_bitrate": 192_000, "name": "1080p"},
    {"height": 720,  "width": 1280, "video_bitrate": 3_000_000, "audio_bitrate": 128_000, "name": "720p"},
    {"height": 540,  "width": 960,  "video_bitrate": 1_500_000, "audio_bitrate": 128_000, "name": "540p"},
    {"height": 360,  "width": 640,  "video_bitrate": 800_000,   "audio_bitrate": 96_000,  "name": "360p"},
]


def _get_client() -> Any:
    endpoint = _resolve_endpoint()
    return boto3.client(
        "mediaconvert",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        endpoint_url=endpoint,
    )


def _output_bucket() -> str:
    return settings.MEDIACONVERT_OUTPUT_BUCKET or settings.AWS_S3_BUCKET


def _hls_output_destination(client_slug: str, video_id: str) -> str:
    """
    S3 URI prefix that MediaConvert uses as the filename base for all HLS files.

    When the Destination string does NOT end with '/', MediaConvert uses the
    last path component as the filename prefix:
      {video_id}.m3u8, {video_id}_1080p.m3u8, {video_id}_1080p_00001.ts, …

    With a trailing slash MediaConvert falls back to its own job-ID as the
    filename base, which breaks the stored hls_manifest_key logic.
    """
    bucket = _output_bucket()
    prefix = settings.MEDIACONVERT_OUTPUT_PREFIX.strip("/")
    return f"s3://{bucket}/{prefix}/{client_slug}/{video_id}/{video_id}"


def _make_video_output(rendition: dict) -> dict:
    """Build a muxed video+audio output for one ABR rendition."""
    return {
        "NameModifier": f"_{rendition['name']}",
        "OutputSettings": {
            "HlsSettings": {}
        },
        "ContainerSettings": {"Container": "M3U8"},
        "VideoDescription": {
            "Width": rendition["width"],
            "Height": rendition["height"],
            "ScalingBehavior": "DEFAULT",
            "CodecSettings": {
                "Codec": "H_264",
                "H264Settings": {
                    "Bitrate": rendition["video_bitrate"],
                    "RateControlMode": "CBR",
                    "CodecProfile": "HIGH",
                    "CodecLevel": "AUTO",
                    "GopSize": 2,
                    "GopSizeUnits": "SECONDS",
                    "GopClosedCadence": 1,
                    "SceneChangeDetect": "ENABLED",
                    "QualityTuningLevel": "SINGLE_PASS_HQ",
                    "AdaptiveQuantization": "HIGH",
                    "EntropyEncoding": "CABAC",
                    "FlickerAdaptiveQuantization": "ENABLED",
                    "Softness": 0,
                    "NumberBFramesBetweenReferenceFrames": 2,
                    "NumberReferenceFrames": 3,
                    "MinIInterval": 0,
                    "SpatialAdaptiveQuantization": "ENABLED",
                    "TemporalAdaptiveQuantization": "ENABLED",
                },
            },
        },
        "AudioDescriptions": [
            {
                "AudioSourceName": "Audio Selector 1",
                "AudioTypeControl": "FOLLOW_INPUT",
                "LanguageCodeControl": "FOLLOW_INPUT",
                "CodecSettings": {
                    "Codec": "AAC",
                    "AacSettings": {
                        "Bitrate": rendition["audio_bitrate"],
                        "CodingMode": "CODING_MODE_2_0",
                        "SampleRate": 48000,
                        "Specification": "MPEG4",
                    },
                },
            }
        ],
    }


def _make_audio_output(audio_bitrate: int) -> dict:
    """Build a standalone AAC audio output that all video renditions reference."""
    return {
        "NameModifier": "_audio",
        "OutputSettings": {
            "HlsSettings": {
                "AudioGroupId": "audio_aac",
                "AudioTrackType": "ALTERNATE_AUDIO_AUTO_SELECT_DEFAULT",
            }
        },
        "ContainerSettings": {"Container": "M3U8"},
        "AudioDescriptions": [
            {
                "AudioSourceName": "Audio Selector 1",
                "AudioTypeControl": "FOLLOW_INPUT",
                "LanguageCodeControl": "FOLLOW_INPUT",
                "CodecSettings": {
                    "Codec": "AAC",
                    "AacSettings": {
                        "Bitrate": audio_bitrate,
                        "CodingMode": "CODING_MODE_2_0",
                        "SampleRate": 48000,
                        "Specification": "MPEG4",
                    },
                },
            }
        ],
    }


def _build_job_settings(
    input_s3_uri: str,
    output_destination: str,
    drm_key_hex: str | None = None,
    drm_key_url: str | None = None,
) -> dict:
    """
    Build the complete MediaConvert job settings dict.

    drm_key_hex  : 32-char hex string of the 16-byte AES-128 key.
    drm_key_url  : URL baked into #EXT-X-KEY URI of the HLS manifest.
    """
    hls_group_settings: dict[str, Any] = {
        "Destination": output_destination,
        "SegmentLength": 6,
        "MinSegmentLength": 0,
        "SegmentControl": "SEGMENTED_FILES",
        "OutputSelection": "MANIFESTS_AND_SEGMENTS",
        "ManifestCompression": "NONE",
        "ManifestDurationFormat": "INTEGER",
        "CodecSpecification": "RFC_4281",
        "DirectoryStructure": "SINGLE_DIRECTORY",
        "StreamInfResolution": "INCLUDE",
        "CaptionLanguageSetting": "OMIT",
    }

    # AES-128 encryption
    if drm_key_hex and drm_key_url:
        hls_group_settings["Encryption"] = {
            "EncryptionMethod": "AES128",
            "Type": "STATIC_KEY",
            "StaticKeyProvider": {
                "StaticKeyValue": drm_key_hex,
                "Url": drm_key_url,
            },
        }

    outputs = [_make_video_output(r) for r in _RENDITIONS]

    return {
        "TimecodeConfig": {"Source": "ZEROBASED"},
        "OutputGroups": [
            {
                "Name": "HLS Group",
                "OutputGroupSettings": {
                    "Type": "HLS_GROUP_SETTINGS",
                    "HlsGroupSettings": hls_group_settings,
                },
                "Outputs": outputs,
            }
        ],
        "Inputs": [
            {
                "FileInput": input_s3_uri,
                "AudioSelectors": {
                    "Audio Selector 1": {"DefaultSelection": "DEFAULT"}
                },
                "VideoSelector": {"ColorSpace": "FOLLOW"},
                "TimecodeSource": "ZEROBASED",
            }
        ],
    }


def create_hls_job(
    *,
    input_s3_key: str,
    client_slug: str,
    video_id: str,
    drm_key_hex: str | None = None,
    drm_key_url: str | None = None,
) -> str:
    """
    Submit an AWS MediaConvert job to transcode a raw video into ABR HLS.

    Returns the MediaConvert Job ID (used to poll status).
    Raises RuntimeError on configuration or AWS errors.
    """
    bucket = settings.AWS_S3_BUCKET
    input_uri = f"s3://{bucket}/{input_s3_key}"
    output_destination = _hls_output_destination(client_slug, video_id)

    job_settings = _build_job_settings(
        input_s3_uri=input_uri,
        output_destination=output_destination,
        drm_key_hex=drm_key_hex,
        drm_key_url=drm_key_url,
    )

    try:
        client = _get_client()
        response = client.create_job(
            Role=settings.MEDIACONVERT_ROLE_ARN,
            Queue=settings.MEDIACONVERT_QUEUE_ARN,
            Settings=job_settings,
            UserMetadata={
                "video_id": video_id,
                "client_slug": client_slug,
            },
        )
        job_id: str = response["Job"]["Id"]
        logger.info("MediaConvert job created: %s for video %s", job_id, video_id)
        return job_id
    except (BotoCoreError, ClientError) as exc:
        logger.error("Failed to create MediaConvert job for video %s: %s", video_id, exc)
        raise RuntimeError(f"MediaConvert job creation failed: {exc}") from exc


def get_job_status(job_id: str) -> dict:
    """
    Fetch the current status and progress of a MediaConvert job.

    Returns a dict with keys: status, progress, error_message.
    Raises RuntimeError on AWS errors (e.g. job not found).
    """
    try:
        client = _get_client()
        response = client.get_job(Id=job_id)
        job = response["Job"]
        status_str = job["Status"]                     # SUBMITTED / PROGRESSING / COMPLETE / ERROR / CANCELED
        progress = job.get("JobPercentComplete", 0)
        error_message = job.get("ErrorMessage")
        return {
            "status": status_str,
            "progress": progress,
            "error_message": error_message,
        }
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"Could not fetch MediaConvert job {job_id}: {exc}") from exc


def hls_manifest_s3_key(client_slug: str, video_id: str) -> str:
    """
    S3 key of the master HLS manifest that MediaConvert produces.

    MediaConvert writes the master playlist as:
      {prefix}/{client_slug}/{video_id}/{video_id}.m3u8
    (The filename matches the 'Destination' path last segment without trailing slash.)
    """
    prefix = settings.MEDIACONVERT_OUTPUT_PREFIX.strip("/")
    return f"{prefix}/{client_slug}/{video_id}/{video_id}.m3u8"


def hls_manifest_url(client_slug: str, video_id: str) -> str:
    """
    Public URL for the HLS manifest.  Uses CloudFront if configured, else S3.
    """
    key = hls_manifest_s3_key(client_slug, video_id)
    if settings.CLOUDFRONT_DOMAIN:
        domain = settings.CLOUDFRONT_DOMAIN.rstrip("/")
        return f"https://{domain}/{key}"
    bucket = _output_bucket()
    return f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"


def invalidate_cloudfront_hls(client_slug: str, video_id: str) -> None:
    """
    Issue a CloudFront invalidation for all HLS files of a single video.

    Called after MediaConvert completes so that stale cached segments (encrypted
    with the previous DRM key) are evicted immediately.  Without this, a
    regenerated video would serve old segments that cannot be decrypted by the
    new key stored in the database.

    No-op when CLOUDFRONT_DISTRIBUTION_ID is not configured.
    """
    if not settings.CLOUDFRONT_DISTRIBUTION_ID:
        logger.debug("CLOUDFRONT_DISTRIBUTION_ID not set — skipping CloudFront invalidation.")
        return

    prefix = settings.MEDIACONVERT_OUTPUT_PREFIX.strip("/")
    path = f"/{prefix}/{client_slug}/{video_id}/*"

    try:
        cf = boto3.client(
            "cloudfront",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        cf.create_invalidation(
            DistributionId=settings.CLOUDFRONT_DISTRIBUTION_ID,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": [path]},
                "CallerReference": f"{video_id}-{uuid.uuid4()}",
            },
        )
        logger.info("CloudFront invalidation created for path: %s", path)
    except (BotoCoreError, ClientError) as exc:
        # Non-fatal: the video will eventually be correct after the cache TTL expires.
        logger.warning("CloudFront invalidation failed for video %s: %s", video_id, exc)
