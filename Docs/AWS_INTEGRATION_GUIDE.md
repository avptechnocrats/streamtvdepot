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
