# AWS Metrics Integration & Usage Tracking Implementation

This document outlines the complete implementation of AWS metrics collection, usage tracking, alerting, and invoice generation for the StreamTVDepot SAAS platform.

## Overview

The system automatically collects usage metrics from AWS services monthly and generates alerts when clients exceed usage thresholds. Industry-standard thresholds are:
- **At Risk (80%)**: Warning threshold
- **Over Limit (100%)**: Hard limit exceeded
- **Critical (110%)**: Severe overage

## Architecture

### Components

#### 1. **AWS Metrics Collection** (`app/core/aws_metrics.py`)
Collector class for fetching metrics from AWS services:
- **CloudFront**: Bandwidth usage (BytesDownloaded)
- **S3**: Storage usage (BucketSizeBytes)
- **MediaConvert**: Encoding minutes (job durations)
- **CloudWatch**: Custom metrics for concurrent users

**Key Methods:**
- `get_bandwidth_gb()`: Total GB transferred for month
- `get_storage_gb()`: Current storage in GB
- `get_encoding_minutes()`: Total encoding minutes
- `get_concurrent_peak()`: Peak concurrent users

#### 2. **Models**

**AlertMetricType Enum:**
- `bandwidth`: Bandwidth usage
- `storage`: Storage usage
- `encoding`: Encoding minutes
- `api_calls`: API calls

**AlertThresholdType Enum:**
- `at_risk`: ≥80% of limit
- `over_limit`: ≥100% of limit
- `critical`: ≥110% of limit

**AlertStatus Enum:**
- `active`: Alert is active
- `acknowledged`: Client/admin acknowledged
- `resolved`: Issue resolved

**UsageAlert Model:**
- Tracks alerts per client per billing month
- Stores usage metrics and threshold info
- Timestamps for notifications and acknowledgements

**AlertNotificationLog Model:**
- Logs all email notifications sent
- Tracks delivery status and errors
- Supports email opens tracking (future)

#### 3. **Monthly Usage Collection Job** (`app/tasks/monthly_usage.py`)

**`collect_monthly_usage(db, billing_year, billing_month)`:**
1. Gets all active clients
2. Collects metrics from AWS for each client
3. Computes overages based on plan limits
4. Creates/updates `ClientMonthlyUsage` records
5. Triggers alert generation

**Process:**
```
For each client:
  Get bandwidth, storage, encoding, concurrent users from AWS
  Get plan limits and overage rates
  Calculate overages:
    - bandwidth_overage = max(0, used - limit) * rate_per_gb
    - storage_overage = max(0, used - limit) * rate_per_gb
    - encoding_overage = max(0, used - limit) * rate_per_min
    - api_overage = max(0, used - limit) * rate_per_million
  Create monthly usage record
  Check each metric against thresholds
  Create alerts for exceeded thresholds
```

#### 4. **Scheduler** (`app/core/scheduler.py`)

Uses APScheduler for cron-based job execution.

**Configuration:**
- Runs on **1st of each month at 02:00 UTC**
- Collects usage for **previous month**
- Idempotent: Can run multiple times safely

**Setup:**
```python
# In app/main.py:
from app.core.scheduler import schedule_jobs

scheduler = schedule_jobs(app)

# On shutdown:
scheduler.shutdown()
```

#### 5. **Invoice Generation** (`app/core/invoice_generator.py`)

Generates invoices in multiple formats:

**Formats Supported:**
- **PDF**: Professional PDF with reportlab
- **CSV**: Spreadsheet-compatible format

**Contains:**
- Invoice date, client name, plan
- Line items: Base fee + all overages
- Total amount due
- Currency

#### 6. **API Endpoints**

**Alerts:**
- `GET /superadmin/alerts`: List all alerts with filtering
- `GET /superadmin/alerts/{alert_id}`: Get specific alert
- `PATCH /superadmin/alerts/{alert_id}/acknowledge`: Mark as acknowledged

**Invoices:**
- `GET /superadmin/usage/{client_id}/invoice?year={year}&month={month}&format=pdf|csv`: Download invoice

## Configuration

### VOD Segment Delivery Through CloudFront

HLS manifests remain behind the backend playback authorization and DRM key
endpoints. By default their segments use private S3 presigned URLs. To use
CloudFront edge caching for movie and uploaded-trailer segments, open
**SuperAdmin > Settings > AWS** and save **CloudFront Domain**, **VOD CloudFront
Public Key ID**, and **VOD CloudFront Private Key (PEM)**.

These values use the existing `superadmin_settings.config["aws"]` JSON object;
no database migration is needed. The private key is Fernet-encrypted as
`vod_cf_private_key_pem_encrypted` using the existing secret-encryption mechanism.
It is never returned by the settings API, which exposes only
`vod_cf_private_key_pem_set`. Leave the private-key input blank to keep the saved
key, enter a new PEM to replace it, or select **Clear saved VOD private key** to
remove it. The signing pair is applied immediately in the saving worker and
within 60 seconds in other workers. An incomplete database signing pair falls
back to the environment pair, never a mixture of database and environment keys.

Environment variables remain an optional fallback, not a requirement for
database-configured deployments:

```dotenv
CLOUDFRONT_DOMAIN=d1234567890abc.cloudfront.net
VOD_CF_KEY_PAIR_ID=your-cloudfront-public-key-id
VOD_CF_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Keep the private key in encrypted platform settings or protected deployment
secrets, never in source control.
The public key ID is not a distribution ID or a key-group ID. Use a dedicated
2048-bit RSA key pair, add its public key to a CloudFront trusted key group, and
attach the group to the HLS segment cache behavior. Live-channel signing settings
are separate and are not changed by this feature.

Before enabling these settings on the live backend:

1. Point the CloudFront segment behavior at the **MediaConvert output bucket**
   (`MEDIACONVERT_OUTPUT_BUCKET`, or `AWS_S3_BUCKET` when unset). Preserve the full
   output key path; do not duplicate `MEDIACONVERT_OUTPUT_PREFIX` in the origin path.
   Use S3 Origin Access Control and grant that distribution `s3:GetObject` in the
   private bucket policy. Keep S3 Block Public Access enabled.
2. Create an HLS-only behavior matching the output prefix and `.ts` files, such as
   `hls/*.ts`. Require signed URLs via the trusted key group on this behavior;
   do not restrict unrelated image/static behaviors that use unsigned URLs.
3. Use a cache policy with no viewer query strings, cookies, or headers in the
   cache key. CloudFront still validates its reserved `Policy`, `Signature`, and
   `Key-Pair-Id` URL parameters before serving cached objects. Do not forward S3
   SigV4 query parameters to this origin. Start with a one-day default segment TTL;
   keep `CLOUDFRONT_DISTRIBUTION_ID` configured so regeneration can invalidate
   overwritten media. Do not mark reused object paths immutable.
4. Attach a response headers policy that **overrides origin CORS** with
   `Access-Control-Allow-Origin: *`, allows `GET`, `HEAD`, and `OPTIONS`, and does
   not enable credentialed CORS. VOD segments use URL signatures, not cookies.
   Allow request headers needed for range requests and expose `Content-Length`,
   `Content-Range`, and `Accept-Ranges`. Do not apply this policy to backend DRM
   or account endpoints. This override avoids caching one tenant's S3 CORS origin
   and replaying it to another tenant.
5. Confirm the CDN hostname/certificate, bucket permissions, behavior matching,
   and trusted public key before saving the signing settings. An invalid key
   or distribution configuration must be fixed, not bypassed by making S3 public.

The backend signs one six-hour policy per quality-playlist response, scoped to
that video's output directory, and reuses it across segment URLs. RSA key parsing
is cached in-process. Playback authorization, DRM key-token binding, and manifest
`no-store` headers remain unchanged. No object migration or re-encoding is needed.
If any of the three resolved runtime settings is absent, delivery retains the
signed-S3 fallback. Clearing database values restores any environment fallback;
to disable signing entirely, remove the signing pair from both sources.
Fully configured but invalid signing settings fail rather than emit unsigned URLs.

Verify on the live deployment before considering the rollout complete:

- An authorized quality playlist contains the configured CDN hostname and signed
  URL parameters, and its DRM key URL retains the correct playback token.
- A signed segment returns `200` (or `206` for a range request); removing or
  altering its signature returns `403`. Also test an expired signature and a
  signature reused outside the authorized video's directory.
- Repeating the exact same segment URL produces a CloudFront cache hit, then
  repeat with a newly authorized session URL to verify the shared cache key.
- Both storefront and admin origins receive usable CORS responses. Test seeking
  and quality switching in Chrome and Safari without broadening DRM access.
- Compare startup time, segment download time versus segment duration, buffering
  events, and CloudWatch CloudFront cache-hit/error metrics before and after.

## Media Library Auto-Transcoding

Successful video upload confirmation (including recovered uploads through
`POST /admin/upload/reconcile`) queues a durable, asset-owned DRM HLS job in the
same database transaction as asset registration. Images and audio are not queued.
Repeated confirmation is serialized per tenant/source and returns the same asset.

Upload confirmation commits the asset and job, then wakes the asset worker
immediately, without requiring an episode or draft save. The existing
`episode_transcoding` scheduler also checks pending asset jobs every minute as a
recovery path. Workers claim jobs using row locks with `SKIP LOCKED` and retry
recoverable submission failures. MediaConvert requests use the job row ID as an idempotency
token; DRM keys are persisted before submission and retained across recovery.
The Media Library polls active renditions every five seconds while it is open.

Selecting the same source for another video or episode reuses its completed or active
`abr_hls_v1_drm` rendition without another MediaConvert submission. Rendition
identity includes tenant, source S3 key, and encoding profile. Episode saves link
to the shared rendition. Existing completed or active clear episode streams
(`abr_hls_v1_clear`) remain usable without forced re-encoding; new episode
attachments prefer the shared DRM profile and can reuse a completed legacy
rendition when no DRM rendition exists. Newly required output always uses DRM.
Trailer previews remain separate outputs.

The series editor reads selected-asset readiness through the tenant-scoped
`GET /admin/upload/video-rendition?source_url=...` endpoint. A completed asset can
be previewed and its episode marked Published before any draft save. Series
publication requires at least one Published episode and completed streams for
all Published episodes; draft episodes do not block it. The backend revalidates
readiness when saving the publication.

A valid new-series form automatically creates its initial database record as
Draft once an episode video or series banner has been uploaded or selected.
Creation is debounced until tracked uploads finish; the initial episodes are
saved as Draft too. This happens once, keeps the form open, and reuses the saved
series and episode IDs for later explicit Save Draft or Publish actions. Later
edits still require an explicit save. Invalid forms wait for correction, and
save failures are shown in the form without an automatic retry loop.

Admin asset previews use rendition- and tenant-bound playback tokens. Episode
playlists and DRM keys use episode- and rendition-bound tokens, so reusing one
rendition across content does not bypass each episode's access controls. Key and
playlist responses remain uncached; segment URLs expire with playback authorization.

Failed library jobs can be explicitly retried through
`POST /admin/upload/media-assets/{asset_id}/transcode`. This endpoint also reuses
completed or active renditions; it does not force re-encoding. Missing AWS/DRM
configuration marks the rendition failed without losing the successful upload.

Deploy the upload/transcoding handlers and asset worker together, with the
asset-rendition and nullable-video transcode-job migrations applied. Verify the
live scheduler is enabled and observe one job per tenant/source/profile before
considering rollout complete.

This change does not provision AWS resources, alter live-channel pipelines, or
automatically enable CloudFront. Keep the existing S3 fallback available during
rollout. Review CloudFront requests/data transfer and S3 origin requests together;
cache hits should reduce origin traffic, but cost savings depend on actual usage
and AWS pricing. Cache policies and response headers require live verification.

### Environment Variables

Add to `.env`:

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

# CloudFront Distribution ID pattern (optional)
CLOUDFRONT_DISTRIBUTION_ID_PATTERN=cf-{client_slug}

# S3 bucket pattern (optional)
S3_BUCKET_PATTERN=streamtvdepot-{client_slug}
```

### Database Migrations

Run the migration to create alert tables:

```bash
docker compose exec backend alembic upgrade head
```

This creates:
- `usage_alerts` table
- `alert_notification_logs` table
- Enum types for alert statuses and metrics

### Dependencies

Add to `requirements.txt`:
```
apscheduler==3.10.4  # Cron scheduling
reportlab==4.0.9     # PDF generation
boto3==1.35.45       # Already included
```

## Usage

### Manual Execution (Testing)

```python
# In Python shell with app context:
from app.tasks.monthly_usage import collect_monthly_usage
from datetime import datetime

now = datetime.now()
prev_month = now.month - 1 if now.month > 1 else 12
prev_year = now.year if now.month > 1 else now.year - 1

# Run collection for previous month
await collect_monthly_usage(db, prev_year, prev_month)
```

### Automatic Execution

Scheduler starts automatically on app startup:

```python
# app/main.py
from contextlib import asynccontextmanager
from app.core.scheduler import schedule_jobs

scheduler = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global scheduler
    scheduler = schedule_jobs(app)
    yield
    if scheduler:
        scheduler.shutdown()

app = FastAPI(lifespan=lifespan)
```

### Frontend Integration

**Alerts Page** (`/admin/alerts`):
- Lists all usage alerts
- Filters by status (active/acknowledged/resolved)
- Shows client, metric, threshold, usage %
- Links to client usage detail page

**Usage Detail Page** (`/admin/usage/[clientId]`):
- Invoice download buttons (PDF/CSV) per month
- Usage charts with overage breakdown
- Current month stats with usage bars

## Industry Standards

This implementation follows industry standards for OTT SAAS platforms:

### Overage Pricing Model
| Metric | Industry Standard | Our Implementation |
|--------|------------------|--------------------|
| Bandwidth | $0.10-0.50/GB | Configurable per plan |
| Storage | $0.05-0.10/GB/month | Configurable per plan |
| Encoding | $0.005-0.01/minute | Configurable per plan |
| API Calls | $0.001-0.01/1M calls | Configurable per plan |

### Alert Thresholds
| Threshold | Level | Action |
|-----------|-------|--------|
| 80% | At Risk | Warning email |
| 100% | Over Limit | Urgent email |
| 110% | Critical | Escalation email + support ticket |

### Billing Cycle
- **Monthly aggregation**: 1st of month
- **Usage period**: Previous calendar month
- **Invoice generation**: Automatic on finalization
- **Invoice delivery**: Email to client billing contact

## Testing

### Test AWS Connection

```python
from app.core.aws_metrics import AWSMetricsCollector
from app.core.config import settings

collector = AWSMetricsCollector(
    aws_access_key=settings.AWS_ACCESS_KEY_ID,
    aws_secret_key=settings.AWS_SECRET_ACCESS_KEY,
)

# Test bandwidth collection
bw = collector.get_bandwidth_gb("test-client", 2026, 5)
print(f"Bandwidth: {bw} GB")

# Test storage collection
st = collector.get_storage_gb("test-client")
print(f"Storage: {st} GB")
```

### Test Alert Generation

```python
from app.models.superadmin.usage import ClientMonthlyUsage
from app.models.superadmin.plan import SaasSubscriptionPlan

# Create test usage record exceeding limits
usage = ClientMonthlyUsage(
    client_id=client_id,
    billing_year=2026,
    billing_month=5,
    bandwidth_gb_used=150,  # Exceeds 100GB limit
    storage_gb_used=500,
    encoding_minutes_used=5000,
    concurrent_users_peak=100,
)

# Trigger alerts
await trigger_usage_alerts(db, client, plan, usage)

# Check alerts table
alerts = await db.execute(
    select(UsageAlert).where(UsageAlert.client_id == client_id)
)
for alert in alerts.scalars():
    print(f"Alert: {alert.metric_type} at {alert.threshold_type}")
```

## Troubleshooting

### No metrics collected
- Verify AWS credentials in environment
- Check CloudFront distribution ID format (cf-{client_slug})
- Verify S3 bucket naming (streamtvdepot-{client_slug})
- Check CloudWatch metrics are being published

### Alerts not created
- Verify plan has usage limits and overage rates
- Check collection job executed successfully
- Verify calculations: overage = max(0, used - limit) * rate

### Invoice download fails
- Verify reportlab is installed: `pip install reportlab`
- Check usage record exists in database
- Verify plan information is complete

### Scheduler not starting
- Check APScheduler is installed
- Verify lifespan context manager is set up
- Check application logs for scheduler errors

## Future Enhancements

1. **Email Notifications**
   - Send alerts to client admins
   - Send to superadmin for critical alerts
   - Customizable email templates

2. **Escalation Rules**
   - Auto-create support tickets at 110%
   - Suspend service at configurable threshold
   - Auto-purchase overage packs

3. **Usage Projections**
   - Predict month-end usage based on current pace
   - Alert if projected to exceed limits
   - Suggest plan upgrades

4. **Audit Logs**
   - Track all usage modifications
   - Log alert acknowledgements
   - Invoice generation history

5. **Export Formats**
   - Excel (.xlsx) with charts
   - JSON for integrations
   - Email delivery of invoices

## API Reference

### List Alerts
```http
GET /api/v1/superadmin/alerts?status=active&page=1&page_size=20

Response: UsageAlert[]
```

### Get Alert
```http
GET /api/v1/superadmin/alerts/{alert_id}

Response: UsageAlert
```

### Acknowledge Alert
```http
PATCH /api/v1/superadmin/alerts/{alert_id}/acknowledge
Content-Type: application/json

{
  "acknowledged_by": "admin@example.com"
}
```

### Download Invoice
```http
GET /api/v1/superadmin/usage/{client_id}/invoice?year=2026&month=5&format=pdf

Response: Binary PDF or CSV file
```

## Database Schema

### usage_alerts
```sql
id UUID PRIMARY KEY
client_id UUID (FK → clients)
billing_year INT
billing_month INT
metric_type ENUM(bandwidth, storage, encoding, api_calls)
threshold_type ENUM(at_risk, over_limit, critical)
status ENUM(active, resolved, acknowledged)
current_usage FLOAT
plan_limit FLOAT (nullable)
usage_percentage FLOAT
notified_at TIMESTAMP (nullable)
acknowledged_at TIMESTAMP (nullable)
acknowledged_by VARCHAR (nullable)
resolved_at TIMESTAMP (nullable)
created_at TIMESTAMP (default: now)
updated_at TIMESTAMP (default: now)
```

### alert_notification_logs
```sql
id UUID PRIMARY KEY
alert_id UUID (FK → usage_alerts)
recipient_email VARCHAR
recipient_type VARCHAR (superadmin, client_admin, end_user)
sent_at TIMESTAMP (nullable)
delivery_status VARCHAR (pending, sent, failed)
error_message TEXT (nullable)
opened_at TIMESTAMP (nullable)
created_at TIMESTAMP (default: now)
updated_at TIMESTAMP (default: now)
```
