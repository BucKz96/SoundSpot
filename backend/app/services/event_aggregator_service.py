import asyncio
import logging
from unicodedata import normalize

from app.core.config import settings
from app.schemas.event import EventResponse
from app.services.discovery_service import get_cached_discovery_events_for_search
from app.services.openagenda_service import search_openagenda_events_by_city
from app.services.shotgun_service import search_shotgun_events
from app.services.ticketmaster_service import (
    is_ticketmaster_rate_limited,
    search_events_by_city,
)


class EventAggregationError(Exception):
    pass


logger = logging.getLogger(__name__)


def _safe_error_message(error: BaseException) -> str:
    message = str(error)
    ticketmaster_api_key = (settings.ticketmaster_api_key or "").strip()
    shotgun_api_key = (settings.shotgun_api_key or "").strip()
    openagenda_api_key = (settings.openagenda_api_key or "").strip()

    if ticketmaster_api_key:
        message = message.replace(ticketmaster_api_key, "[redacted]")
    if shotgun_api_key:
        message = message.replace(shotgun_api_key, "[redacted]")
    if openagenda_api_key:
        message = message.replace(openagenda_api_key, "[redacted]")

    return message


def _normalize_text(value: str) -> str:
    normalized = normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")

    return ascii_value.casefold().strip()


def _dedupe_key(event: EventResponse) -> tuple[str, str, str, str]:
    return (
        _normalize_text(event.name),
        (event.date or "").strip(),
        _normalize_text(event.city),
        _normalize_text(event.venue),
    )


def _dedupe_events(events: list[EventResponse]) -> list[EventResponse]:
    seen_ids = set()
    seen_keys = set()
    unique_events = []

    for event in events:
        if event.id and event.id in seen_ids:
            continue

        key = _dedupe_key(event)
        if key in seen_keys:
            continue

        if event.id:
            seen_ids.add(event.id)
        seen_keys.add(key)
        unique_events.append(event)

    return unique_events


def _event_sort_key(event: EventResponse) -> tuple[int, str, str]:
    date = (event.date or "").strip()
    time = (event.time or "").strip()

    if not date:
        return (1, "", event.name.casefold())

    return (0, f"{date}T{time or '00:00'}", event.name.casefold())


def _sort_events_by_date(events: list[EventResponse]) -> list[EventResponse]:
    return sorted(events, key=_event_sort_key)


def _event_matches_city(event: EventResponse, city: str) -> bool:
    normalized_city = _normalize_text(city)
    event_city = _normalize_text(event.city)
    event_venue = _normalize_text(event.venue)

    return (
        normalized_city == event_city
        or normalized_city == event_venue
        or normalized_city in event_venue
    )


def _filter_cached_discovery_events_by_city(city: str) -> list[EventResponse]:
    cached_events = get_cached_discovery_events_for_search()
    if not cached_events:
        return []

    matches = [event for event in cached_events if _event_matches_city(event, city)]
    if matches:
        logger.info("City search served from cache city=%s count=%s", city, len(matches))

    return _sort_events_by_date(_dedupe_events(matches))


async def search_events_by_city_across_sources(city: str) -> list[EventResponse]:
    cached_events = _filter_cached_discovery_events_by_city(city)
    if cached_events:
        return cached_events

    provider_searches = []
    if is_ticketmaster_rate_limited():
        logger.warning(
            "City search skipped provider=ticketmaster reason=rate_limited city=%s",
            city,
        )
    else:
        provider_searches.append(("ticketmaster", search_events_by_city(city)))

    provider_searches.extend(
        (
            ("shotgun", search_shotgun_events(city)),
            ("openagenda", search_openagenda_events_by_city(city)),
        )
    )
    results = await asyncio.gather(
        *(search for _, search in provider_searches),
        return_exceptions=True,
    )
    events: list[EventResponse] = []
    errors: list[BaseException] = []

    for (provider_name, _), result in zip(provider_searches, results):
        if isinstance(result, BaseException):
            errors.append(result)
            logger.warning(
                "City search provider failed provider=%s city=%s error_type=%s error=%s",
                provider_name,
                city,
                type(result).__name__,
                _safe_error_message(result),
            )
            continue

        events.extend(result)

    if events:
        return _sort_events_by_date(_dedupe_events(events))

    if errors:
        logger.warning(
            "City search returned no events after provider errors city=%s errors=%s",
            city,
            [type(error).__name__ for error in errors],
        )

    return []
