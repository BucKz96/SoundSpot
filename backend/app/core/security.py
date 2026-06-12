import uuid
from datetime import UTC, datetime, timedelta

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings

AUTH_COOKIE_NAME = "soundspot_access_token"
password_hash = PasswordHash.recommended()


class TokenConfigurationError(Exception):
    """Raised when JWT settings are incomplete."""


def require_token_configuration() -> None:
    if not settings.jwt_secret_key.strip():
        raise TokenConfigurationError("JWT secret key is not configured.")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: uuid.UUID) -> str:
    require_token_configuration()
    secret = settings.jwt_secret_key.strip()

    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": issued_at,
            "exp": expires_at,
        },
        secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> uuid.UUID | None:
    secret = settings.jwt_secret_key.strip()
    if not secret:
        return None

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[settings.jwt_algorithm],
        )
        subject = payload.get("sub")
        return uuid.UUID(subject) if isinstance(subject, str) else None
    except (InvalidTokenError, ValueError):
        return None
