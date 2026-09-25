from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))


def create_access_token(subject: str | Any, extra_data: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": str(subject), "exp": expire, **(extra_data or {})}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_ad_playback_token(subject: str, claims: dict) -> str:
    payload = {
        "sub": subject,
        "type": "ad_playback",
        "exp": datetime.now(timezone.utc) + timedelta(hours=6),
        **claims,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str | Any,
    extra_data: dict | None = None,
    expires_in_days: int | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=expires_in_days or settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(subject),
        "exp": expire,
        "type": "refresh",
        **(extra_data or {}),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_email_verification_token(subject: str | Any, extra_data: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        hours=settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS
    )
    payload = {
        "sub": str(subject),
        "exp": expire,
        "type": "email_verification",
        **(extra_data or {}),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return {}


# ─── Generic secret encryption (for payment gateway keys, SMTP passwords, etc.) ─

def _fernet() -> Fernet:
    key = settings.DRM_FERNET_KEY
    if not key:
        raise RuntimeError(
            "DRM_FERNET_KEY is not configured. Generate one with:\n"
            "  python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a plaintext secret string using Fernet. Returns a base64 token string."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Decrypt a Fernet token back to the original secret string."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Secret decryption failed – wrong key or corrupt data.") from exc
