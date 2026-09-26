"""
AWS Metrics collection for usage tracking
CloudFront (bandwidth), S3 (storage), MediaConvert (encoding minutes)
"""

from datetime import datetime, timezone
import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class AWSMetricsCollector:
    """Collects usage metrics from AWS services."""

    def __init__(
        self,
        aws_access_key: str,
        aws_secret_key: str,
        aws_region: str = "us-east-1",
    ):
        self.region = aws_region
        self.cloudfront = boto3.client(
            "cloudfront",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region,
        )
        self.s3 = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region,
        )
        self.mediaconvert = boto3.client(
            "mediaconvert",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region,
        )
        self.cloudwatch = boto3.client(
            "cloudwatch",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region,
        )
        self._diagnostics: dict[str, dict[str, str]] = {}

    def _classify_error(self, exc: Exception) -> str:
        if isinstance(exc, ClientError):
            code = (exc.response or {}).get("Error", {}).get("Code", "")
            if code in {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation"}:
                return "iam_access_denied"
            if code in {"InvalidParameterCombination", "InvalidParameterValue"}:
                return "query_window_invalid"
            return f"aws_{code.lower()}" if code else "aws_client_error"
        if isinstance(exc, BotoCoreError):
            return "aws_sdk_error"
        return "unknown_error"

    def _set_metric_error(self, client_slug: str, metric: str, message: str) -> None:
        self._diagnostics.setdefault(client_slug, {})[metric] = message

    def _set_metric_exception(self, client_slug: str, metric: str, exc: Exception) -> None:
        label = self._classify_error(exc)
        self._set_metric_error(client_slug, metric, f"{label}: {exc}")

    def _clear_metric_error(self, client_slug: str, metric: str) -> None:
        if client_slug in self._diagnostics:
            self._diagnostics[client_slug].pop(metric, None)

    def get_client_diagnostics(self, client_slug: str) -> dict[str, str]:
        return dict(self._diagnostics.get(client_slug, {}))

    def get_bandwidth_gb(self, client_slug: str, year: int, month: int) -> float:
        """
        Get bandwidth from CloudFront metrics (CloudWatch).
        Returns total GB transferred for the month for this client's CloudFront distribution.
        """
        try:
            # Query CloudWatch Metrics for this client's CloudFront distribution
            # Assumes tag-based identification: client_slug in dimension or distribution ID
            start_time = datetime(year, month, 1, tzinfo=timezone.utc)
            if month == 12:
                end_time = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
            else:
                end_time = datetime(year, month + 1, 1, tzinfo=timezone.utc)

            response = self.cloudwatch.get_metric_statistics(
                Namespace="AWS/CloudFront",
                MetricName="BytesDownloaded",
                Dimensions=[
                    # Filter by distribution ID tagged with client_slug
                    {"Name": "DistributionId", "Value": f"cf-{client_slug}"}
                ],
                StartTime=start_time,
                EndTime=end_time,
                Period=86400,  # Daily
                Statistics=["Sum"],
            )

            total_bytes = sum(dp["Sum"] for dp in response.get("Datapoints", []))
            self._clear_metric_error(client_slug, "bandwidth")
            return round(total_bytes / (1024**3), 2)  # Convert to GB
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Failed to get CloudFront bandwidth for {client_slug}: {e}")
            self._set_metric_exception(client_slug, "bandwidth", e)
            return 0.0

    def _prefix_size_bytes(self, bucket_name: str, prefix: str) -> int:
        """Return total object size in bytes for a prefix."""
        total = 0
        token = None

        while True:
            params = {
                "Bucket": bucket_name,
                "Prefix": prefix,
                "MaxKeys": 1000,
            }
            if token:
                params["ContinuationToken"] = token

            response = self.s3.list_objects_v2(**params)
            for obj in response.get("Contents", []):
                total += int(obj.get("Size", 0) or 0)

            if not response.get("IsTruncated"):
                break
            token = response.get("NextContinuationToken")

        return total

    def get_storage_gb(self, client_slug: str, bucket_name: str | None = None) -> float:
        """
        Get storage from S3 object prefixes.
        For shared-bucket tenancy, sum tenant roots:
        - {client_slug}/
        - hls/{client_slug}/
        """
        if not bucket_name:
            self._set_metric_error(client_slug, "storage", "configuration_error: AWS_S3_BUCKET is empty")
            return 0.0

        try:
            prefixes = [f"{client_slug}/", f"hls/{client_slug}/"]
            total_bytes = 0
            for prefix in prefixes:
                total_bytes += self._prefix_size_bytes(bucket_name, prefix)

            self._clear_metric_error(client_slug, "storage")
            return round(total_bytes / (1024**3), 2)
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Failed to get S3 storage for {client_slug}: {e}")
            self._set_metric_exception(client_slug, "storage", e)
            return 0.0

    def get_encoding_minutes(self, client_slug: str, year: int, month: int) -> float:
        """
        Get encoding minutes from MediaConvert jobs (CloudWatch).
        Sums up all job durations for the client in the given month.
        """
        try:
            start_time = datetime(year, month, 1, tzinfo=timezone.utc)
            if month == 12:
                end_time = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
            else:
                end_time = datetime(year, month + 1, 1, tzinfo=timezone.utc)

            total_minutes = 0.0
            next_token = None

            # MediaConvert supports max 20 per request; iterate all pages.
            while True:
                params = {"Status": "COMPLETE", "MaxResults": 20}
                if next_token:
                    params["NextToken"] = next_token

                jobs_response = self.mediaconvert.list_jobs(**params)

                for job in jobs_response.get("Jobs", []):
                    if job.get("StatusUpdateDateTime"):
                        job_time = job["StatusUpdateDateTime"]
                        if start_time <= job_time < end_time:
                            timing = job.get("Timing", {})
                            if "StartTime" in timing and "FinishTime" in timing:
                                duration_ms = timing["FinishTime"] - timing["StartTime"]
                                total_minutes += duration_ms / 60000  # Convert ms to minutes

                next_token = jobs_response.get("NextToken")
                if not next_token:
                    break

            self._clear_metric_error(client_slug, "encoding")
            return round(total_minutes, 2)
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Failed to get MediaConvert encoding for {client_slug}: {e}")
            self._set_metric_error(client_slug, "encoding", str(e))
            return 0.0

    def get_concurrent_peak(self, client_slug: str, year: int, month: int) -> int:
        """
        Get peak concurrent users from CloudWatch custom metrics.
        Assumes application publishes custom metric per client.
        """
        try:
            start_time = datetime(year, month, 1, tzinfo=timezone.utc)
            if month == 12:
                end_time = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
            else:
                end_time = datetime(year, month + 1, 1, tzinfo=timezone.utc)

            range_seconds = max(1, int((end_time - start_time).total_seconds()))
            # CloudWatch get_metric_statistics supports a max of 1440 datapoints.
            min_period = max(300, (range_seconds // 1440) + 1)
            # Period should be a multiple of 60 seconds.
            period = ((min_period + 59) // 60) * 60

            response = self.cloudwatch.get_metric_statistics(
                Namespace="StreamTVDepot/Usage",
                MetricName="ConcurrentUsers",
                Dimensions=[{"Name": "ClientSlug", "Value": client_slug}],
                StartTime=start_time,
                EndTime=end_time,
                Period=period,
                Statistics=["Maximum"],
            )

            datapoints = response.get("Datapoints", [])
            if datapoints:
                self._clear_metric_error(client_slug, "concurrent_peak")
                return int(max(dp["Maximum"] for dp in datapoints))
            self._set_metric_error(client_slug, "concurrent_peak", "no_datapoints: No CloudWatch concurrent-user datapoints returned")
            return 0
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Failed to get concurrent peak for {client_slug}: {e}")
            self._set_metric_exception(client_slug, "concurrent_peak", e)
            return 0
