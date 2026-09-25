from functools import lru_cache
from typing import List, Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "SignalView"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://signalview:signalview_secret@localhost:5432/signalview"
    DATABASE_POOL_MODE: Literal["queue", "null"] = "queue"
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 5
    DATABASE_POOL_TIMEOUT: int = 30

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""
    BILLING_WORKER_CONCURRENCY: int = 4
    BILLING_TASK_TIME_LIMIT_SECONDS: int = 120
    BILLING_RENEWAL_DISPATCH_BATCH_SIZE: int = 500
    NOTIFICATION_WORKER_CONCURRENCY: int = 4
    NOTIFICATION_TASK_TIME_LIMIT_SECONDS: int = 90
    REMINDER_DISPATCH_BATCH_SIZE: int = 1000

    # Security
    SECRET_KEY: str = "29c18658e47de26f481ab26e122143aa"
    ALGORITHM: str = "HS256"
    # Large media uploads can run long on slower networks; keep admin access
    # tokens valid long enough to complete presign/upload/confirm safely.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    END_USER_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = 48

    # When True, end users must verify their email before they can log in.
    END_USER_EMAIL_VERIFICATION_REQUIRED: bool = False

    # CORS
    # In production add all client domains here, or use ALLOWED_ORIGINS_REGEX.
    # e.g. ["https://signalview.com","https://admin.signalview.com","https://kalingo.tv","https://admin.kalingo.tv"]
    ALLOWED_ORIGINS: List[str] = ["http://localhost","http://localhost:3000","http://localhost:3001","http://localhost:8000","http://localhost:8001","https://www.streamtvdepot.com","https://streamtvdepot.com","https://preview.streamtvdepot.com","https://console.streamtvdepot.com","https://splixtv.mitiztechnologies.in"]

    ALLOWED_ORIGINS_REGEX: str = ""
    """Optional regex that matches any origin — useful for wildcard client domains in production.
    e.g. r'https://(.*.signalview.com|.*.kalingo.tv)'"""

    # Preview deployment base domain (e.g. "preview.signalview.tech").
    # When set, all <slug>.<PREVIEW_BASE_DOMAIN> origins are automatically
    # allowed in both the FastAPI CORS middleware and the S3 CORS policy.
    PREVIEW_BASE_DOMAIN: str = ""

    # SuperAdmin seed
    SUPERADMIN_EMAIL: str = "superadmin@streamtvdepot.com"
    SUPERADMIN_PASSWORD: str = "SuperAdmin@123"

    # Storage
    STORAGE_BACKEND: str = "local"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = ""
    AWS_REGION: str = "us-east-1"
    AWS_S3_STORAGE_CLASS: str = "STANDARD"

    # AWS MediaConvert (ABR transcoding)
    # MEDIACONVERT_ENDPOINT is optional – if left empty it is auto-discovered
    # at runtime via boto3 describe_endpoints() and cached in-process.
    # You can still pin it explicitly for faster cold starts:
    #   aws mediaconvert describe-endpoints --region us-east-1
    MEDIACONVERT_ENDPOINT: str = ""           # optional: https://xxxxxxxx.mediaconvert.us-east-1.amazonaws.com
    MEDIACONVERT_ROLE_ARN: str = ""           # IAM Role ARN with MediaConvert + S3 r/w permissions
    MEDIACONVERT_QUEUE_ARN: str = "Default"   # ARN or name of the MediaConvert queue

    # S3 output for HLS segments (can be the same as AWS_S3_BUCKET)
    MEDIACONVERT_OUTPUT_BUCKET: str = ""      # Defaults to AWS_S3_BUCKET when empty
    MEDIACONVERT_OUTPUT_PREFIX: str = "hls"   # S3 prefix for transcoded output

    # CloudFront CDN (optional – serves HLS segments; falls back to S3 URLs)
    CLOUDFRONT_DOMAIN: str = ""               # e.g. d1234567890abc.cloudfront.net
    CLOUDFRONT_DISTRIBUTION_ID: str = ""      # e.g. E1234ABCDEFGHIJ – required for cache invalidation on HLS regeneration

    # Public URL of this backend service as seen by browsers.
    # Used to construct HLS proxy URLs returned in the API.
    # Dev default:  http://localhost:8001
    # Production:   https://api.yourdomain.com  (or https://yourdomain.com when behind nginx)
    BACKEND_PUBLIC_URL: str = "http://localhost:8001"
    FRONTEND_PUBLIC_URL: str = "http://localhost:3001"

    # DRM – AES-128 HLS Encryption
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    DRM_FERNET_KEY: str = ""                  # Fernet key used to encrypt stored AES-128 video keys
    # The base URL that players call to fetch the AES-128 decryption key.
    # This value is baked into the HLS manifest's #EXT-X-KEY URI by MediaConvert.
    # Example: https://api.yourdomain.com/api/v1/drm/key
    DRM_KEY_DELIVERY_BASE_URL: str = ""

    # RTMP Live Streaming
    # Host of the EC2/VPS running Nginx-RTMP (IP or domain, no protocol prefix)
    RTMP_SERVER_HOST: str = ""          # e.g. "203.0.113.10" or "rtmp.yourdomain.com"
    RTMP_APP_NAME: str = "live"         # Nginx RTMP application name
    # Base HTTP URL where Nginx serves HLS segments
    RTMP_HLS_BASE_URL: str = ""         # e.g. "http://203.0.113.10/hls"
    # Local directory where recorded live streams are written as MP4 files.
    RTMP_RECORDINGS_DIR: str = "/recordings"

    # OTT Ads (Hybrid model: CSAI VMAP/VAST + SSAI)
    AD_HYBRID_DEFAULT_MODE: str = "hybrid"   # hybrid | csai | ssai | none
    AD_CSAI_DEFAULT_VMAP_TAG_URL: str = ""   # Google Ad Manager VMAP URL
    AD_CSAI_DEFAULT_VAST_TAG_URL: str = ""   # Fallback VAST URL
    AD_CSAI_TIMEOUT_SECONDS: int = 8
    AD_CSAI_SHOW_COUNTDOWN: bool = True

    # SSAI stitcher base URL (optional). Example:
    # https://ssai.example.com/stitch
    # The playback resolver appends stream + content query params.
    SSAI_BASE_URL: str = ""
    SSAI_ENABLED_FOR_VOD: bool = True
    SSAI_ENABLED_FOR_LIVE: bool = True

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    # When set, /webhooks/stripe/{slug} routes to the platform handler for this slug
    PLATFORM_STRIPE_SLUG: str = ""

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAILS_FROM_EMAIL: str = "noreply@signalview.com"
    BREVO_API_KEY: str = ""
    BREVO_SENDER_EMAIL: str = ""
    BREVO_SENDER_NAME: str = "SignalView"

    model_config = {"env_file": ".env", "case_sensitive": True}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
