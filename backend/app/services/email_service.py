import logging
from urllib.parse import urlencode

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger("uvicorn.error")


def build_email_verification_url(raw_token: str) -> str:
    frontend_url = settings.frontend_url.strip().rstrip("/")
    query = urlencode({"token": raw_token})
    return f"{frontend_url}/verify-email?{query}"


def send_verification_email(user: User, raw_token: str) -> None:
    verification_url = build_email_verification_url(raw_token)
    provider = settings.email_provider.strip().casefold() or "log"

    if provider == "log":
        logger.info(
            "Email verification link for %s: %s",
            user.email,
            verification_url,
        )
        return

    logger.warning(
        "Email provider %r is not implemented; verification link for %s: %s",
        provider,
        user.email,
        verification_url,
    )
