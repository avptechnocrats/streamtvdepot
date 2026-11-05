import hashlib
import hmac
import math
import time

from altcha import Payload, create_challenge, verify_solution
from redis.asyncio import Redis
from redis.exceptions import RedisError

CHALLENGE_TTL_SECONDS = 300
CHALLENGE_COST = 5000


class SignupVerificationError(Exception):
    pass


class SignupProtectionUnavailable(Exception):
    pass


def _tenant_key(secret: str, tenant_id: str) -> str:
    if len(secret) < 32:
        raise SignupProtectionUnavailable("A strong signup verification secret is required")
    return hmac.new(secret.encode(), f"storefront-signup:{tenant_id}".encode(), hashlib.sha256).hexdigest()


def create_signup_challenge(tenant_id: str, secret: str) -> dict:
    return create_challenge(
        algorithm="PBKDF2/SHA-256",
        cost=CHALLENGE_COST,
        key_prefix="00",
        expires_at=int(time.time()) + CHALLENGE_TTL_SECONDS,
        data={"tenant_id": tenant_id, "purpose": "signup"},
        hmac_secret=_tenant_key(secret, tenant_id),
    ).to_dict()


async def verify_signup_challenge(payload: str, tenant_id: str, secret: str, redis_url: str) -> None:
    key = _tenant_key(secret, tenant_id)
    try:
        if not payload or len(payload) > 16384:
            raise SignupVerificationError("Invalid verification")
        solution = Payload.from_base64(payload)
        result = verify_solution(solution, key)
        parameters = solution.challenge.parameters
        remaining = parameters.expires_at - time.time() if parameters.expires_at else 0
        if (
            not result.verified
            or remaining <= 0
            or remaining > CHALLENGE_TTL_SECONDS
            or parameters.data != {"tenant_id": tenant_id, "purpose": "signup"}
        ):
            raise SignupVerificationError("Invalid or expired verification")
        signature = solution.challenge.signature
    except (ValueError, TypeError, KeyError, AttributeError, RecursionError, OverflowError) as error:
        raise SignupVerificationError("Invalid verification") from error

    try:
        async with Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2) as cache:
            accepted = await cache.set(
                f"signup:altcha:{tenant_id}:{signature}",
                "1",
                ex=math.ceil(remaining),
                nx=True,
            )
    except (RedisError, OSError) as error:
        raise SignupProtectionUnavailable("Signup verification is temporarily unavailable") from error
    if not accepted:
        raise SignupVerificationError("Verification was already used")