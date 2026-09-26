The current media streaming in the file 
/backend/app/api/v1/media/stream.py

This is a workaround, not industry standard. It has a real performance cost.

What the industry actually does
Layer	Standard approach
Segments	Served from CDN (CloudFront/Cloudflare) directly to the browser — zero backend involvement
CORS	CDN forwards the Origin header to S3 and caches the response per origin, so every origin gets its own Access-Control-Allow-Origin header
Manifests	Also served from CDN (or proxied if DRM access control is needed)
The root cause of the entire CORS chain is simpler than the proxy: the IAM user imagdent-s3 is missing s3:PutBucketCORS permission, so the backend can't apply the wildcard S3 CORS rule it already generates correctly.

Performance impact of the current proxy
Each .ts segment (720p ~2–4 MB, 1080p ~4–8 MB at 2-second intervals) now flows through the FastAPI backend instead of directly from S3/CDN:

Bandwidth: 100 concurrent viewers at 1080p ≈ 400–800 MB/s through your server
Latency: Every segment adds a server round-trip (S3→backend→browser) vs direct S3/CDN
CPU/Memory: uvicorn workers buffer each segment in memory before sending
No CDN caching: every segment hit is a cold S3 fetch
The proper fix (2 steps, permanent)
Step 1 — Add s3:PutBucketCORS to the IAM user in AWS Console:

IAM → Users → imagdent-s3 → Permissions → Add inline policy:

Step 2 — Revert .ts segments back to presigned S3 URLs (removing the proxy overhead) and force-recreate the backend so configure_s3_cors() re-runs with the new permission:

That's it. The backend already generates the correct S3 CORS JSON with https://*.preview.streamtvdepot.com — it just can't apply it without the permission.