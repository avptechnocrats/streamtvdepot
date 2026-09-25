"""
DRM – AES-128 HLS encryption key management.

Each protected video gets a unique, randomly-generated 16-byte
(128-bit) AES key.  That key is:

  1. Stored at-rest in the DB column Video.drm_key_encrypted,
     encrypted with Fernet (AES-256-CBC + HMAC-SHA256).

  2. Delivered at playback time from the key-delivery endpoint
     /api/v1/drm/key/{video_id}.  The endpoint verifies a short-lived
     JWT (the "key-access token") that the frontend obtains right before
     starting playback.

HLS player integration
──────────────────────
hls.js ``xhrSetup`` is used to inject the ``Authorization: Bearer <token>``
header into every XHR request including key fetches.  The manifest URI baked
in by MediaConvert is therefore just the bare endpoint URL with no embedded
secrets:

    #EXT-X-KEY:METHOD=AES-128,URI="https://api.example.com/api/v1/drm/key/<video_id>"

Widevine / FairPlay note
────────────────────────
AES-128 satisfies most OTT DRM requirements without needing Widevine or
FairPlay licenses.  If you need EME-grade DRM (e.g. for HD gating):
  • Replace StaticKeyProvider in mediaconvert.py with a SPEKE provider URL.
  • Use a third-party DRM service (EZDRM, Axinom, BuyDRM).
  • Switch the player to Shaka Player (supports Widevine + FairPlay via EME).
"""

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Fernet cipher ────────────────────────────────────────────────────────────

def _fernet() -> Fernet:
    """Return a Fernet cipher using the configured key.  Raises on bad config."""
    key = settings.DRM_FERNET_KEY
    if not key:
        raise RuntimeError(
            "DRM_FERNET_KEY is not configured.  Generate one with:\n"
            "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


# ─── Key generation & storage helpers ────────────────────────────────────────

def generate_aes128_key() -> bytes:
    """Return a cryptographically-random 16-byte AES-128 key."""
    return secrets.token_bytes(16)


def encrypt_key(raw_key: bytes) -> str:
    """Encrypt *raw_key* with Fernet and return the token as a str for DB storage."""
    return _fernet().encrypt(raw_key).decode()


def decrypt_key(encrypted: str) -> bytes:
    """Decrypt a Fernet token back to the raw 16-byte AES key."""
    try:
        return _fernet().decrypt(encrypted.encode())
    except InvalidToken as exc:
        raise RuntimeError("DRM key decryption failed – wrong Fernet key or corrupt data.") from exc


def key_as_hex(raw_key: bytes) -> str:
    """Return 32-char hex string. This is what MediaConvert expects for StaticKeyValue."""
    return raw_key.hex()


# ─── Key-access JWT ───────────────────────────────────────────────────────────
#
# A short-lived JWT is issued to authenticated users immediately before
# playback.  The key-delivery endpoint verifies this token before returning
# the raw AES key.
#
# Claims:
#   sub  – user_id (str)
#   vid  – video_id (str)
#   exp  – expiry (default 6 h – generous for a single viewing session)

_KEY_TOKEN_EXPIRE_HOURS = 6
_KEY_TOKEN_ALGORITHM = "HS256"
_KEY_TOKEN_PURPOSE = "drm_key_access"


def create_key_access_token(*, video_id: str, user_id: str) -> str:
    """
    Issue a JWT that authorises *user_id* to fetch the AES key for *video_id*.
    Frontend must include this as ``Authorization: Bearer <token>`` when the
    player requests the #EXT-X-KEY URI.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "vid": video_id,
        "purpose": _KEY_TOKEN_PURPOSE,
        "iat": now,
        "exp": now + timedelta(hours=_KEY_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=_KEY_TOKEN_ALGORITHM)


def verify_key_access_token(token: str) -> dict:
    """
    Verify and decode a key-access JWT.

    Returns the payload dict on success.
    Raises ``ValueError`` if the token is invalid, expired, or for a different purpose.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[_KEY_TOKEN_ALGORITHM])
    except JWTError as exc:
        raise ValueError(f"Invalid DRM key token: {exc}") from exc

    if payload.get("purpose") != _KEY_TOKEN_PURPOSE:
        raise ValueError("Token purpose mismatch.")

    return payload
