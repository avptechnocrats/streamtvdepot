# Partner delivery and Filmhub ingestion

## Architecture

Each tenant/partner receives a private, versioned delivery bucket in the platform's AWS account. Names follow `stv-delivery-<tenant-slug>-<partner-uuid-prefix>`; long tenant slugs are truncated to S3's 63-character limit. The prefix is configurable, and the bucket name is persisted so tenant renames do not orphan existing deliveries.

Each partner receives `s3://<delivery-bucket>/incoming/`. Select **None (S3 delivery only)** to provision access without metadata notifications, automatic import, transcoding, or publication. Select **Filmhub CSV 3.0** only for a provider using that format. Each metadata CSV and its referenced files must share a package directory, with relative filenames and metadata uploaded last. The importer supports Filmhub Movies & Shows CSV 3.0, including multi-row rights and episode packages; other metadata formats are not yet supported.

S3 CSV notifications feed an encrypted SQS queue with a 14-day retention period and a dead-letter queue. The scheduler records events durably before acknowledging them, scans the bucket to recover missed notifications, and processes packages with a per-delivery PostgreSQL transaction advisory lock. Bucket scans are paginated; a completed scan runs hourly. Replicated deliveries are also discovered by this scan; do not rely on ObjectCreated events for replica arrivals.

The worker pins source S3 versions and copies assets to `s3://<AWS_S3_BUCKET>/<tenant-slug>/partners/<partner-id>/<scope>/<source-version-hash>/<filename>`. Scope is `artwork` for supported images and `private` for mezzanines, trailers and captions. Unchanged source versions reuse assets and renditions. MediaConvert writes HLS to the existing configured output bucket under `hls/<tenant-slug>/<rendition-id>/`. Filmhub has no access to the production bucket or HLS.

Metadata, SKU mappings, license snapshots, captions and transcode preparation commit together. Failed imports roll back database changes; immutable copies are reused on retry. Older delivered CSV versions are skipped. Errors retry with exponential backoff and appear in Content Partners > Delivery History. After the configured retry limit, an operator must retry the package. External storage is never deleted automatically.

## Enablement

Deploy the backend migration before serving requests with the new code:

```sh
docker compose exec -T stv_backend python -m alembic upgrade head
```

New dependencies are installed into Docker images, not bind mounts. Rebuild and recreate the backend and affected workers using your existing deployment process; do not restart database services or remove volumes. If migrations are run in a new image, execute them in that image before enabling its API processes.

Configure these values in the backend environment:

```dotenv
PARTNER_DELIVERY_ENABLED=true
PARTNER_DELIVERY_PRIVATE_SOURCES_CONFIRMED=true
PARTNER_DELIVERY_BUCKET_PREFIX=stv-delivery
PARTNER_DELIVERY_REGION=us-east-1
PARTNER_DELIVERY_ROLE_ARN=arn:aws:iam::<PLATFORM_ACCOUNT_ID>:role/stv-partner-delivery
PARTNER_INGEST_MAX_CSV_BYTES=10485760
PARTNER_INGEST_MAX_ROWS=10000
PARTNER_INGEST_MAX_ATTEMPTS=8
```

Both enablement flags default to false. Before confirming private sources, merge this statement into the production bucket policy, replacing the bucket placeholder. Keep existing CloudFront/MediaPackage grants; this explicit deny overrides broad CloudFront read grants for private sources without affecting artwork or HLS. Test both configured distributions. Do not attach this deny to the delivery bucket instead.

```json
{
	"Sid": "DenyCloudFrontPartnerMezzanineAccess",
	"Effect": "Deny",
	"Principal": { "Service": "cloudfront.amazonaws.com" },
	"Action": "s3:GetObject",
	"Resource": "arn:aws:s3:::<PRODUCTION_BUCKET>/*/partners/*/private/*"
}
```

All production sources must also be inaccessible through public S3 ACLs/policies or public application endpoints. Keep Block Public Access enabled, and require signed viewer access on the HLS CloudFront behavior. The confirmation flag is an operator attestation, not automatic AWS policy verification.

The provisioning role is optional when the application's own AWS role already has the required access, but a dedicated assumable role is recommended. Its trust policy must allow only your backend workload role; the workload role needs `sts:AssumeRole` for this exact role. Do not trust the content partner to assume this role. Configure CloudWatch alarms for dead-letter queue depth and prolonged pending/failed database ingestion states.

Provisioning uses boto3's credential chain when explicit AWS credentials are absent. The assumed role handles provisioning, delivery reads, and source copies; ordinary application credentials continue to handle normal media playback and transcoding. Configure MediaConvert's existing role to read the production source prefix and write the HLS prefix.

Use the identity policy in `infra/partner-delivery-policy.json` on the provisioning role after replacing placeholders. The delivery bucket prefix in the policy must match `PARTNER_DELIVERY_BUCKET_PREFIX`. The production source resource is deliberately restricted to `*/partners/*`; the role cannot modify HLS or normal uploads. These permissions do not authorize a different AWS account's bucket without a matching resource policy.

## Partner configuration

In Content Partners, enable S3 delivery access and enter the partner's IAM role, IAM user, or AWS account root ARN. Prefer an exact delivery role ARN. Select the applicable metadata import mode separately. The optional console invitation sends a password setup email for a partner console account and is independent of AWS access. The backend derives the tenant identity from the authenticated administrator. Region is platform-controlled, not supplied by the partner or browser.

Choose direct uploads or replication. Replication grants ReplicateObject and ReplicateTags, but not replicated deletes or bucket-wide versioning changes. Bucket-owner-enforced ownership is enabled; upload with no ACL or `bucket-owner-full-control`. If Filmhub requires more permissions, agree them explicitly rather than granting the full template automatically. Filmhub must configure its own IAM identity and replication source; this platform cannot configure another account.

Before enabling automatic publication, confirm with Filmhub that each CSV contains a complete per-title license snapshot, end dates are inclusive, and the configured IANA timezone is correct. The importer interprets an inclusive end date as the next local midnight converted to UTC. The default timezone is UTC, but it is not a contractual assertion. Updates are quarantined until snapshot semantics are confirmed. Omission of an episode from another episode's package never revokes that omitted episode.

Imports default to draft. New titles use subscription access when the tenant has active subscription plans, or free access when it has none. Free access requires an active AVOD license; SVOD-only or TVOD-only titles remain unavailable until their access settings and rights permit playback. The default is applied when a title is first imported and does not change existing titles or later individual monetization settings. If subscription plans are selected, viewers need one of those plans and it must also apply to the title; leaving the selection empty permits any applicable subscription plan. Automatic publication requires confirmed snapshot semantics. AVOD/TVOD rights are retained, but advertising/prices and other viewing modes require editorial configuration. Published content is query-filtered for current rights, so expired licenses disappear without destroying publication state and future windows activate automatically. Manual draft/archived changes are not undone by the publication worker after its initial publication.

## Metadata, assets, and rights

- Identity is tenant + partner + entity kind + Filmhub SKU, mapped to existing UUID content IDs. Movie, series, episode and supplied season SKUs are retained.
- The supplied Caminandes sample has no season SKU. Season numbers are retained; warnings identify the missing provider identity. Obtain the actual season SKU field before relying on SKU-based season takedowns. Supported field names are `Season SKU` and `Episode Season SKU`.
- Original per-entity metadata is preserved, including ratings, credits, production details, chapters and rights. Artwork is registered in the media library; portrait, landscape and textless hero assets populate content thumbnails. Movie and series trailers are transcoded separately with the clear preview profile.
- SRT and WebVTT subtitles are validated with pysubs2 and converted to WebVTT. Episode captions are assigned by the episode SKU in each filename. Other formats, including SCC, fail the import with an actionable conversion error rather than publishing unusable tracks. Verify supplier caption-language labels: the movie sample reuses files under multiple labels.
- Rights are preserved as separate SVOD/AVOD/TVOD rows. Superseded licenses are revoked with ingestion provenance rather than deleted. A valid license must match the configured viewing mode, country, start time, end time and takedown status.
- Request-scoped ORM filters apply to public listings, details, checkout, playback authorization, manifests and keys. Content without a provider mapping keeps its existing behavior. Restricted licenses fail closed when no trusted country is available. Configure the trusted proxy's `X-Geo-Country` and `X-Geo-Auth` integration and `PLAYBACK_GEO_AUTH_SECRET`; never trust a browser-supplied country.
- Signed segment URLs are capped at the license end; keys and manifests recheck current rights. Revocation cannot recall segments or keys already downloaded into a viewer's buffer. Existing AES-128 protection is not studio multi-DRM; Widevine/FairPlay/PlayReady needs a separate packaging integration.
- Use Revoke Content Rights with the provider SKU and an audit reason for email takedowns. Series and season takedowns propagate to episodes at query time and persist through future imports. Partner deactivation denies rights immediately and queues removal of delivery grants; it never deletes source files. A global provisioning disable pauses provisioning and ingestion, so revoke a partner's AWS grants manually if urgent while the worker is disabled.

## Acceptance and operations

Validate in an AWS staging account before production enablement: upload a small movie and episode package, verify prefix isolation, duplicate-event handling, missing-file retry, overwrite versions, failed transcode retry, caption selection, expired/future licenses, trusted-country denial, SKU takedown, partner deactivation and recovery after worker restart. Monitor copy/MediaConvert costs and apply a separate reviewed source-retention policy; this implementation only automatically aborts incomplete multipart uploads after seven days.

Local validation is not a substitute for AWS integration and PostgreSQL migration checks on the live backend. The scheduler must be running for provisioning, ingestion, reconciliation and automatic publication. Request-time rights enforcement does not depend on scheduler punctuality.