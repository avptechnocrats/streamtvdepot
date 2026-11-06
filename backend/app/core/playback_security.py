import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

from botocore.signers import CloudFrontSigner
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from fastapi import HTTPException, Request

from app.core.config import settings
from app.core.storage import presign_get_url


def trusted_country(request: Request) -> str | None:
    expected = settings.PLAYBACK_GEO_AUTH_SECRET
    supplied = request.headers.get("X-Geo-Auth", "")
    if not expected or not secrets.compare_digest(expected.encode(), supplied.encode()):
        return None
    country = request.headers.get("X-Geo-Country", "").strip().upper()
    return country if len(country) == 2 and country.isascii() and country.isalpha() else None


def enforce_geo_access(request: Request, rules: dict | None) -> None:
    rules = rules or {}
    blocked = {value.upper() for value in (rules.get("blocked_countries") or [])}
    allowed = {value.upper() for value in (rules.get("allowed_countries") or [])}
    if not blocked and not allowed:
        return
    country = trusted_country(request)
    if country is None:
        raise HTTPException(status_code=403, detail="Your location could not be verified")
    if country in blocked or (allowed and country not in allowed):
        raise HTTPException(status_code=403, detail="This content is unavailable in your country")


@lru_cache(maxsize=1)
def _signing_key(pem: str):
    return serialization.load_pem_private_key(pem.replace("\\n", "\n").encode(), password=None)


def _signing_credentials() -> tuple[str, str]:
    if settings.PLAYBACK_CF_KEY_PAIR_ID or settings.PLAYBACK_CF_PRIVATE_KEY_PEM:
        return settings.PLAYBACK_CF_KEY_PAIR_ID, settings.PLAYBACK_CF_PRIVATE_KEY_PEM
    if settings.VOD_CF_KEY_PAIR_ID and settings.VOD_CF_PRIVATE_KEY_PEM:
        return settings.VOD_CF_KEY_PAIR_ID, settings.VOD_CF_PRIVATE_KEY_PEM
    return settings.LIVE_CF_KEY_PAIR_ID, settings.LIVE_CF_PRIVATE_KEY_PEM


def protected_playback_url(url: str | None, *, external: bool = False, expires_at: str | None = None) -> str:
    if not url:
        raise HTTPException(status_code=404, detail="Playback media is unavailable")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Invalid playback source") from exc
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or port not in (None, 443):
        raise HTTPException(status_code=503, detail="A secure playback source is required")
    path = unquote(parsed.path)
    if "\\" in path or any(part in (".", "..") for part in path.split("/")):
        raise HTTPException(status_code=503, detail="Invalid playback path")
    ttl = max(60, min(settings.PLAYBACK_URL_TTL_SECONDS, 3600))
    if expires_at:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        ttl = min(ttl, int((expiry - datetime.now(timezone.utc)).total_seconds()))
        if ttl <= 0:
            raise HTTPException(status_code=403, detail="Playback access has expired")
    host = parsed.hostname.lower()
    bucket = settings.AWS_S3_BUCKET
    s3_hosts = {
        f"{bucket}.s3.amazonaws.com",
        f"{bucket}.s3.{settings.AWS_REGION}.amazonaws.com",
        f"{bucket}.s3-{settings.AWS_REGION}.amazonaws.com",
    } if bucket else set()
    cdn_host = settings.CLOUDFRONT_DOMAIN.strip().strip("/").lower()
    approved = {value.lower() for value in settings.PLAYBACK_PROTECTED_CDN_HOSTS}
    key_id, pem = _signing_credentials()
    is_hls = path.lower().endswith(".m3u8")

    if not external and not is_hls and (host in s3_hosts or host == cdn_host):
        if cdn_host and cdn_host not in approved:
            raise HTTPException(status_code=503, detail="Require signed viewer requests on the configured media CDN")
        signed = presign_get_url(path.lstrip("/"), expires_in=ttl)
        if not signed:
            raise HTTPException(status_code=503, detail="Private media signing is unavailable")
        return signed

    if host not in approved or not key_id or not pem:
        raise HTTPException(status_code=503, detail="Configure a signature-enforcing CDN for this playback source")
    query = urlencode([(name, value) for name, value in parse_qsl(parsed.query, keep_blank_values=True) if name not in {"Policy", "Signature", "Key-Pair-Id", "Expires"}])
    unsigned = urlunsplit(("https", parsed.netloc, parsed.path, query, ""))
    resource = unsigned
    if is_hls:
        parent = parsed.path.rsplit("/", 1)[0]
        if not parent:
            raise HTTPException(status_code=503, detail="HLS requires a dedicated CDN package directory")
        resource = f"https://{parsed.netloc}{parent}/*"
    try:
        key = _signing_key(pem)
        signer = CloudFrontSigner(key_id, lambda message: key.sign(message, padding.PKCS1v15(), hashes.SHA1()))
        policy = signer.build_policy(resource, datetime.now(timezone.utc) + timedelta(seconds=ttl))
        return signer.generate_presigned_url(unsigned, policy=policy)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="CDN signing configuration is invalid") from exc