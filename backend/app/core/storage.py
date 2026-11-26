"""
Shared S3 / storage utilities.

Presigned GET URLs are the standard way to serve private S3 objects.
IAM-user credentials support up to 7 days (604 800 s) expiry.

SigV4 is forced on the boto3 client to avoid a boto3 SigV2 issue where
x-amz-storage-class is included in the canonical string for GET presigned
URLs. SigV4 presigned GET URLs never include storage-class headers, so they
work directly as <img src> without any extra request headers.
"""
import asyncio
import hashlib
import json
import logging
import re
import uuid
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Optional
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import UploadFile

from app.core.config import settings

logger = logging.getLogger(__name__)

# 7 days — maximum supported by AWS SigV4 with IAM user credentials
_PRESIGN_GET_EXPIRY = 604_800

# Force SigV4 — prevents boto3 from using SigV2 (us-east-1 default) which
# incorrectly includes x-amz-storage-class in GET presigned URL signatures.
_S3_CONFIG = Config(signature_version="s3v4")


def get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=_S3_CONFIG,
    )


def partner_aws_client(service: str, region: str):
    session = boto3.Session(
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
        region_name=region,
    )
    if settings.PARTNER_DELIVERY_ROLE_ARN:
        credentials = session.client("sts").assume_role(
            RoleArn=settings.PARTNER_DELIVERY_ROLE_ARN, RoleSessionName="partner-delivery",
        )["Credentials"]
        return boto3.client(service, region_name=region, config=_S3_CONFIG,
            aws_access_key_id=credentials["AccessKeyId"], aws_secret_access_key=credentials["SecretAccessKey"],
            aws_session_token=credentials["SessionToken"])
    return session.client(service, config=_S3_CONFIG)


def provision_partner_storage(delivery, client_slug: str) -> dict:
    s3 = partner_aws_client("s3", delivery.region)
    sqs = partner_aws_client("sqs", delivery.region)
    account = partner_aws_client("sts", delivery.region).get_caller_identity()["Account"]
    try:
        tags = s3.get_bucket_tagging(Bucket=delivery.bucket, ExpectedBucketOwner=account)["TagSet"]
        if {item["Key"]: item["Value"] for item in tags}.get("PartnerDeliveryId") != str(delivery.id):
            raise ValueError("Delivery bucket ownership tags do not match")
    except ClientError as error:
        if error.response["Error"]["Code"] not in {"NoSuchBucket", "404", "NoSuchTagSet"}:
            raise
        if error.response["Error"]["Code"] == "NoSuchTagSet":
            if not delivery.bucket.endswith("-" + delivery.partner_id.hex[:16]):
                raise ValueError("Refusing to adopt an unrelated untagged bucket") from error
            s3.head_bucket(Bucket=delivery.bucket, ExpectedBucketOwner=account)
        else:
            arguments = {"Bucket": delivery.bucket, "ObjectOwnership": "BucketOwnerEnforced"}
            if delivery.region != "us-east-1":
                arguments["CreateBucketConfiguration"] = {"LocationConstraint": delivery.region}
            s3.create_bucket(**arguments)
        s3.put_bucket_tagging(Bucket=delivery.bucket, Tagging={"TagSet": [
            {"Key": "PartnerDeliveryId", "Value": str(delivery.id)},
            {"Key": "TenantId", "Value": str(delivery.client_id)},
            {"Key": "TenantSlug", "Value": client_slug},
        ]})
    s3.put_public_access_block(Bucket=delivery.bucket, PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True,
    })
    s3.put_bucket_ownership_controls(Bucket=delivery.bucket, OwnershipControls={"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]})
    s3.put_bucket_encryption(Bucket=delivery.bucket, ServerSideEncryptionConfiguration={
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}],
    })
    s3.put_bucket_versioning(Bucket=delivery.bucket, VersioningConfiguration={"Status": "Enabled"})
    s3.put_bucket_lifecycle_configuration(Bucket=delivery.bucket, LifecycleConfiguration={"Rules": [{
        "ID": "AbortIncompleteUploads", "Status": "Enabled", "Filter": {"Prefix": delivery.prefix},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7},
    }]})
    bucket_arn = f"arn:aws:s3:::{delivery.bucket}"
    deny_tls = {"Sid": "RequireTLS", "Effect": "Deny", "Principal": "*", "Action": "s3:*",
        "Resource": [bucket_arn, f"{bucket_arn}/*"], "Condition": {"Bool": {"aws:SecureTransport": "false"}}}
    if not delivery.enabled:
        s3.put_bucket_policy(Bucket=delivery.bucket, Policy=json.dumps({"Version": "2012-10-17", "Statement": [deny_tls]}))
        return {"queue_url": getattr(delivery, "queue_url", None), "queue_arn": getattr(delivery, "queue_arn", None)}
    dlq = sqs.create_queue(QueueName=f"{delivery.bucket}-dlq", Attributes={"MessageRetentionPeriod": "1209600", "SqsManagedSseEnabled": "true"})["QueueUrl"]
    dlq_arn = sqs.get_queue_attributes(QueueUrl=dlq, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    queue_url = sqs.create_queue(QueueName=delivery.bucket, Attributes={
        "VisibilityTimeout": "900", "MessageRetentionPeriod": "1209600", "SqsManagedSseEnabled": "true",
        "RedrivePolicy": json.dumps({"deadLetterTargetArn": dlq_arn, "maxReceiveCount": "8"}),
    })["QueueUrl"]
    queue_arn = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    sqs.set_queue_attributes(QueueUrl=queue_url, Attributes={"Policy": json.dumps({"Version": "2012-10-17", "Statement": [{
        "Sid": "AllowDeliveryEvents", "Effect": "Allow", "Principal": {"Service": "s3.amazonaws.com"},
        "Action": "sqs:SendMessage", "Resource": queue_arn,
        "Condition": {"ArnEquals": {"aws:SourceArn": bucket_arn}, "StringEquals": {"aws:SourceAccount": account}},
    }]})})
    principal = {"AWS": delivery.principal_arn}
    statements = [deny_tls]
    if delivery.enabled:
        actions = ["s3:PutObject", "s3:PutObjectAcl", "s3:GetObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"]
        if delivery.options.get("method") == "replication":
            actions += ["s3:ReplicateObject", "s3:ReplicateTags"]
        statements += [
            {"Sid": "PartnerBucketLocation", "Effect": "Allow", "Principal": principal,
             "Action": ["s3:GetBucketLocation", "s3:GetBucketVersioning"], "Resource": bucket_arn},
            {"Sid": "PartnerListPrefix", "Effect": "Allow", "Principal": principal, "Action": "s3:ListBucket",
             "Resource": bucket_arn, "Condition": {"StringLike": {"s3:prefix": [delivery.prefix.rstrip("/"), delivery.prefix + "*"]}}},
            {"Sid": "PartnerDelivery", "Effect": "Allow", "Principal": principal,
             "Action": actions, "Resource": f"{bucket_arn}/{delivery.prefix}*"},
        ]
    s3.put_bucket_policy(Bucket=delivery.bucket, Policy=json.dumps({"Version": "2012-10-17", "Statement": statements}))
    notifications = {}
    if delivery.options.get("metadata_format", "filmhub_csv_3") == "filmhub_csv_3":
        notifications = {"QueueConfigurations": [{
            "Id": "PartnerMetadata", "QueueArn": queue_arn, "Events": ["s3:ObjectCreated:*"],
            "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": delivery.prefix}, {"Name": "suffix", "Value": ".csv"}]}},
        }]}
    s3.put_bucket_notification_configuration(Bucket=delivery.bucket, NotificationConfiguration=notifications)
    return {"queue_url": queue_url, "queue_arn": queue_arn}


def read_partner_metadata(delivery, key: str, version_id: str) -> bytes:
    s3 = partner_aws_client("s3", delivery.region)
    result = s3.get_object(Bucket=delivery.bucket, Key=key, VersionId=version_id)
    body = result["Body"]
    try:
        raw = body.read(settings.PARTNER_INGEST_MAX_CSV_BYTES + 1)
        if len(raw) > settings.PARTNER_INGEST_MAX_CSV_BYTES:
            raise ValueError("Metadata CSV exceeds size limit")
        return raw
    finally:
        body.close()


def copy_partner_asset(delivery, key: str, destination: str, metadata_date: datetime) -> dict:
    source = partner_aws_client("s3", delivery.region)
    head = source.head_object(Bucket=delivery.bucket, Key=key)
    if not head.get("VersionId") or head["VersionId"] == "null":
        raise ValueError("Delivery object is not versioned")
    if head["LastModified"] > metadata_date:
        raise ValueError("Asset changed after metadata; request a fresh metadata delivery")
    if head["ContentLength"] <= 0:
        raise ValueError(f"Empty delivery asset: {key}")
    generation = hashlib.sha256(f"{key}:{head['VersionId']}".encode()).hexdigest()[:24]
    destination = f"{destination}/{generation}/{PurePosixPath(key).name}"
    target = partner_aws_client("s3", settings.AWS_REGION)
    existing = target.list_objects_v2(Bucket=settings.AWS_S3_BUCKET, Prefix=destination, MaxKeys=1).get("Contents", [])
    if existing and existing[0]["Key"] == destination:
        if existing[0]["Size"] != head["ContentLength"]:
            raise ValueError("Immutable destination asset has unexpected size")
    else:
        target.copy({"Bucket": delivery.bucket, "Key": key, "VersionId": head["VersionId"]},
            settings.AWS_S3_BUCKET, destination, SourceClient=source,
            ExtraArgs={"ServerSideEncryption": "AES256", "StorageClass": settings.AWS_S3_STORAGE_CLASS})
    return {"s3_key": destination, "size": head["ContentLength"], "content_type": head.get("ContentType")}


def prepare_partner_caption(key: str) -> str:
    import pysubs2

    if PurePosixPath(key).suffix.lower() not in {".srt", ".vtt"}:
        raise ValueError("Only SRT and WebVTT captions are supported; request conversion for SCC or other formats")
    s3 = partner_aws_client("s3", settings.AWS_REGION)
    result = s3.get_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    body = result["Body"]
    try:
        raw = body.read(settings.PARTNER_INGEST_MAX_CSV_BYTES + 1)
    finally:
        body.close()
    if len(raw) > settings.PARTNER_INGEST_MAX_CSV_BYTES:
        raise ValueError("Caption exceeds size limit")
    subtitles = pysubs2.SSAFile.from_string(raw.decode("utf-8-sig"), format_="vtt" if key.lower().endswith(".vtt") else "srt")
    if not subtitles or any(cue.start < 0 or cue.end <= cue.start for cue in subtitles):
        raise ValueError("Caption has no usable cues or contains invalid timestamps")
    destination = key + ".web.vtt"
    s3.put_object(Bucket=settings.AWS_S3_BUCKET, Key=destination, Body=subtitles.to_string("vtt").encode(),
        ContentType="text/vtt; charset=utf-8", ServerSideEncryption="AES256")
    return destination


def read_partner_caption(key: str) -> str:
    result = get_s3_client().get_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    body = result["Body"]
    try:
        return body.read(settings.PARTNER_INGEST_MAX_CSV_BYTES + 1).decode("utf-8")
    finally:
        body.close()


def build_tenant_s3_key(client_slug: str, filename: str, folder: str = "support-tickets") -> str:
    """Build S3 key with tenant-specific folder structure."""
    safe_slug = re.sub(r"[^a-z0-9-]+", "-", client_slug.lower()).strip("-")
    return f"{safe_slug}/{folder}/{filename}"


def local_logo_path(client_id: uuid.UUID, s3_key: str) -> Path:
    tenant_id = str(uuid.UUID(str(client_id)))
    asset_id = hashlib.sha256(s3_key.encode()).hexdigest()
    return Path(settings.LOCAL_BRANDING_DIR).resolve() / tenant_id / asset_id


async def cache_logo_locally(client_id: uuid.UUID, s3_key: str) -> Path:
    path = local_logo_path(client_id, s3_key)

    def copy_logo() -> None:
        response = get_s3_client().get_object(Bucket=settings.AWS_S3_BUCKET, Key=s3_key)
        body = response["Body"]
        try:
            if response.get("ContentType") not in {"image/jpeg", "image/png", "image/webp"}:
                raise ValueError("Unsupported logo content type")
            content = body.read(5 * 1024 * 1024 + 1)
        finally:
            body.close()
        if not content or len(content) > 5 * 1024 * 1024:
            raise ValueError("Logo must be between 1 byte and 5 MB")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary_path.write_bytes(content)
            temporary_path.replace(path)
        finally:
            temporary_path.unlink(missing_ok=True)

    await asyncio.to_thread(copy_logo)
    return path


async def upload_attachment_to_s3(
    upload_file: UploadFile,
    client_slug: str,
    folder: str = "ticket-attachments",
) -> str | None:
    """
    Upload a file attachment (image or PDF) to S3 in the tenant's folder.
    Returns the S3 key on success, None on failure.
    """
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID:
        return None
    
    try:
        # Generate unique filename
        file_ext = Path(upload_file.filename or "file").suffix.lower() or ""
        unique_name = f"{uuid.uuid4().hex}{file_ext}"
        s3_key = build_tenant_s3_key(client_slug, unique_name, folder)
        
        # Read file content
        content = await upload_file.read()
        content_type = upload_file.content_type or "application/octet-stream"
        
        # Upload to S3
        s3 = get_s3_client()
        extra_args = {"ContentType": content_type}
        if settings.AWS_S3_STORAGE_CLASS:
            extra_args["StorageClass"] = settings.AWS_S3_STORAGE_CLASS
        
        await asyncio.to_thread(
            s3.put_object,
            Bucket=settings.AWS_S3_BUCKET,
            Key=s3_key,
            Body=content,
            **extra_args,
        )
        return s3_key
    except Exception as exc:
        logger.warning("Could not upload attachment to S3: %s", exc)
        return None


def presign_get_url(
    s3_key: str,
    expires_in: int = _PRESIGN_GET_EXPIRY,
    original_filename: str | None = None,
    inline: bool = True,
) -> str | None:
    """
    Generate a presigned GET URL for a private S3 object.

    Returns a URL valid for `expires_in` seconds (default 7 days).
    Returns None on configuration error or AWS failure.
    The returned URL can be used directly as <img src> or <video src>.

    If `original_filename` is provided, ResponseContentDisposition is baked
    into the signed URL so the browser uses the real filename instead of the
    UUID s3_key basename — mirroring the Yii2 createPresignedRequest pattern.
    Set `inline=False` to force a download (attachment) instead of inline view.
    """
    if not settings.AWS_S3_BUCKET or not settings.AWS_ACCESS_KEY_ID:
        return None
    try:
        s3 = get_s3_client()
        params: dict = {"Bucket": settings.AWS_S3_BUCKET, "Key": s3_key}
        if original_filename:
            disposition = "inline" if inline else "attachment"
            # Sanitise: strip quotes/newlines to prevent header injection
            safe_name = original_filename.replace('"', "").replace("\n", "").replace("\r", "")
            params["ResponseContentDisposition"] = f'{disposition}; filename="{safe_name}"'
        return s3.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.warning("Could not generate presigned GET URL for %s: %s", s3_key, exc)
        return None


def media_display_url(s3_key: str, original_filename: str | None = None) -> str | None:
    """Return the stable CDN URL for browser media, or a signed S3 fallback."""
    cloudfront_domain = settings.CLOUDFRONT_DOMAIN.strip().strip("/")
    if cloudfront_domain:
        return f"https://{cloudfront_domain}/{quote(s3_key, safe='/')}"
    return presign_get_url(s3_key, original_filename=original_filename)
