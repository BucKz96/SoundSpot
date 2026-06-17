import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth_token import AUTH_TOKEN_PURPOSES, AuthToken
from app.models.user import User


class InvalidAuthTokenPurposeError(ValueError):
    """Raised when an auth token purpose is not supported."""


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _as_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _validate_purpose(purpose: str) -> None:
    if purpose not in AUTH_TOKEN_PURPOSES:
        raise InvalidAuthTokenPurposeError(f"Unsupported auth token purpose: {purpose}")


def generate_raw_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def invalidate_user_tokens(db: Session, user: User, purpose: str) -> None:
    _validate_purpose(purpose)
    now = _utc_now()
    tokens = db.scalars(
        select(AuthToken).where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
        )
    ).all()

    for token in tokens:
        token.used_at = now

    db.flush()


def create_auth_token(
    db: Session,
    user: User,
    purpose: str,
    expires_delta: timedelta,
) -> str:
    _validate_purpose(purpose)
    invalidate_user_tokens(db, user, purpose)

    raw_token = generate_raw_token()
    auth_token = AuthToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        purpose=purpose,
        expires_at=_utc_now() + expires_delta,
    )
    db.add(auth_token)
    db.flush()
    return raw_token


def get_valid_token(
    db: Session,
    raw_token: str,
    purpose: str,
) -> AuthToken | None:
    _validate_purpose(purpose)
    auth_token = db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(raw_token),
            AuthToken.purpose == purpose,
        )
    )

    if auth_token is None:
        return None
    if auth_token.used_at is not None:
        return None
    if _as_aware_utc(auth_token.expires_at) <= _utc_now():
        return None

    return auth_token


def consume_auth_token(db: Session, auth_token: AuthToken) -> None:
    auth_token.used_at = _utc_now()
    db.flush()
