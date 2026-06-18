from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic

from fastapi import HTTPException, Request, status

from app.core.config import settings

RATE_LIMIT_MESSAGE = "Too many requests. Please try again later."


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int


AUTH_LOGIN_IP = RateLimitRule("auth:login:ip", 10, 60)
AUTH_LOGIN_EMAIL = RateLimitRule("auth:login:email", 10, 600)
AUTH_REGISTER_IP = RateLimitRule("auth:register:ip", 5, 60)
AUTH_FORGOT_PASSWORD_IP = RateLimitRule("auth:forgot-password:ip", 5, 3600)
AUTH_FORGOT_PASSWORD_EMAIL = RateLimitRule("auth:forgot-password:email", 3, 3600)
AUTH_RESET_PASSWORD_IP = RateLimitRule("auth:reset-password:ip", 10, 3600)
AUTH_RESEND_VERIFICATION_IP = RateLimitRule("auth:resend-verification:ip", 5, 3600)
AUTH_RESEND_VERIFICATION_USER = RateLimitRule(
    "auth:resend-verification:user",
    3,
    3600,
)
AUTH_VERIFY_EMAIL_IP = RateLimitRule("auth:verify-email:ip", 20, 3600)

EVENTS_LIST_IP = RateLimitRule("events:list:ip", 30, 60)
EVENTS_DISCOVERY_IP = RateLimitRule("events:discovery:ip", 30, 60)
EVENTS_SEARCH_IP = RateLimitRule("events:search:ip", 30, 60)
SHOTGUN_SEARCH_IP = RateLimitRule("events:shotgun-search:ip", 20, 60)
SPOTIFY_ARTIST_SEARCH_IP = RateLimitRule("artists:spotify-search:ip", 30, 60)


class MemoryRateLimiter:
    def __init__(self, clock: Callable[[], float] = monotonic) -> None:
        self._clock = clock
        self._requests: dict[str, list[float]] = {}
        self._last_cleanup_at = 0.0

    def clear(self) -> None:
        self._requests.clear()
        self._last_cleanup_at = 0.0

    def set_clock(self, clock: Callable[[], float]) -> None:
        self._clock = clock

    def check(self, key: str, limit: int, window_seconds: int) -> bool:
        now = self._clock()
        window_start = now - window_seconds
        timestamps = [
            timestamp
            for timestamp in self._requests.get(key, [])
            if timestamp > window_start
        ]

        if len(timestamps) >= limit:
            self._requests[key] = timestamps
            self._cleanup(now)
            return False

        timestamps.append(now)
        self._requests[key] = timestamps
        self._cleanup(now)
        return True

    def _cleanup(self, now: float) -> None:
        if now - self._last_cleanup_at < 60:
            return

        self._last_cleanup_at = now
        oldest_active_timestamp = now - 3600
        empty_keys = []
        for key, timestamps in self._requests.items():
            active_timestamps = [
                timestamp
                for timestamp in timestamps
                if timestamp > oldest_active_timestamp
            ]
            if active_timestamps:
                self._requests[key] = active_timestamps
            else:
                empty_keys.append(key)

        for key in empty_keys:
            self._requests.pop(key, None)


rate_limiter = MemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first_forwarded_ip = forwarded_for.split(",", 1)[0].strip()
        if first_forwarded_ip:
            return first_forwarded_ip

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def normalize_rate_limit_key_part(value: object) -> str:
    return str(value or "").strip().casefold()


def require_rate_limit(
    request: Request,
    rule: RateLimitRule,
    *key_parts: object,
) -> None:
    if not settings.rate_limit_enabled:
        return

    normalized_parts = [
        normalize_rate_limit_key_part(part)
        for part in key_parts
        if normalize_rate_limit_key_part(part)
    ]
    key = ":".join([rule.name, get_client_ip(request), *normalized_parts])
    if rate_limiter.check(key, rule.limit, rule.window_seconds):
        return

    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=RATE_LIMIT_MESSAGE,
    )


def clear_rate_limit_store() -> None:
    rate_limiter.clear()


def set_rate_limit_clock(clock: Callable[[], float]) -> None:
    rate_limiter.set_clock(clock)
