from datetime import date
from time import monotonic

from app.core.config import settings
from app.schemas.event import EventResponse
from app.services.shotgun_service import ShotgunAPIError, search_shotgun_events


class DiscoveryAPIError(Exception):
    pass


_cached_events: list[EventResponse] = []
_cache_expires_at = 0.0
_has_cached_response = False


def _get_discovery_max_events() -> int:
    return max(1, min(settings.discovery_max_events, 500))


def _get_discovery_months_ahead() -> int:
    return max(1, min(settings.discovery_months_ahead, 24))


def _get_discovery_cache_ttl_seconds() -> int:
    return max(60, settings.discovery_cache_ttl_seconds)


def _is_valid_coordinate(latitude: float, longitude: float) -> bool:
    return (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
        and not (latitude == 0 and longitude == 0)
    )


def _is_future_event(event: EventResponse) -> bool:
    event_date = (event.date or "").strip()
    if len(event_date) < 10:
        return False

    try:
        parsed_date = date.fromisoformat(event_date[:10])
    except ValueError:
        return False

    return parsed_date >= date.today()


def _event_sort_key(event: EventResponse) -> tuple[str, str, str]:
    event_date = (event.date or "").strip()
    event_time = (event.time or "").strip()

    return (event_date, event_time or "00:00", event.name.casefold())


def _filter_discovery_events(events: list[EventResponse]) -> list[EventResponse]:
    filtered_events = [
        event
        for event in events
        if _is_future_event(event)
        and _is_valid_coordinate(event.latitude, event.longitude)
    ]

    return sorted(filtered_events, key=_event_sort_key)[:_get_discovery_max_events()]


async def get_discovery_events() -> list[EventResponse]:
    global _cached_events, _cache_expires_at, _has_cached_response

    now = monotonic()
    if _has_cached_response and now < _cache_expires_at:
        return _cached_events

    try:
        events = await search_shotgun_events(
            max_events=_get_discovery_max_events(),
            months_ahead=_get_discovery_months_ahead(),
        )
        discovery_events = _filter_discovery_events(events)
        _cached_events = discovery_events
        _has_cached_response = True
        _cache_expires_at = now + _get_discovery_cache_ttl_seconds()

        return discovery_events
    except (ShotgunAPIError, ValueError) as exc:
        if _has_cached_response:
            return _cached_events

        raise DiscoveryAPIError(str(exc)) from exc
