import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


async def send_brevo_email(
    to_email: str,
    subject: str,
    html_content: str,
    *,
    to_name: str | None = None,
    text_content: str | None = None,
) -> bool:
    """
    Send an email via Brevo transactional API.

    Returns True when Brevo accepted the payload, else False.
    """
    if not settings.BREVO_API_KEY:
        logger.warning("BREVO_API_KEY is not configured; skipping email send")
        return False

    sender_email = settings.BREVO_SENDER_EMAIL or settings.EMAILS_FROM_EMAIL
    if not sender_email:
        logger.warning("No sender email configured for Brevo")
        return False

    payload: dict = {
        "sender": {
            "name": settings.BREVO_SENDER_NAME or settings.APP_NAME,
            "email": sender_email,
        },
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": html_content,
    }
    if text_content:
        payload["textContent"] = text_content

    headers = {
        "accept": "application/json",
        "api-key": settings.BREVO_API_KEY,
        "content-type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(_BREVO_SEND_URL, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        logger.exception("Brevo request failed: %s", exc)
        return False

    if response.status_code >= 400:
        logger.error("Brevo send failed: status=%s body=%s", response.status_code, response.text)
        return False

    return True
