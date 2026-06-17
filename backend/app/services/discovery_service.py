import asyncio
import logging
from collections import Counter
from datetime import date
from time import monotonic
from unicodedata import normalize

from app.core.config import settings
from app.schemas.event import EventResponse
from app.services.openagenda_service import (
    OpenAgendaAPIError,
    search_openagenda_discovery_events,
)
from app.services.shotgun_service import ShotgunAPIError, search_shotgun_events
from app.services.ticketmaster_service import (
    TicketmasterAPIError,
    TicketmasterRateLimitError,
    is_ticketmaster_rate_limited,
    search_events_by_city_for_discovery,
)


class DiscoveryAPIError(Exception):
    pass


_cached_events: list[EventResponse] = []
_cache_expires_at = 0.0
_has_cached_response = False
_cache_ticketmaster_attempted = False
_cache_openagenda_attempted = False
_ticketmaster_semaphore = asyncio.Semaphore(4)
_refresh_lock = asyncio.Lock()
logger = logging.getLogger(__name__)


def _get_discovery_max_events() -> int:
    return max(1, min(settings.discovery_max_events, 500))


def _get_discovery_months_ahead() -> int:
    return max(1, min(settings.discovery_months_ahead, 24))


def _get_discovery_cache_ttl_seconds() -> int:
    return max(60, settings.discovery_cache_ttl_seconds)


def _get_shotgun_max_events() -> int:
    return max(1, min(settings.discovery_shotgun_max_events, _get_discovery_max_events()))


def _get_ticketmaster_max_events_per_city() -> int:
    return max(1, min(settings.discovery_ticketmaster_max_events_per_city, 50))


def _get_ticketmaster_max_events_total() -> int:
    return max(
        1,
        min(
            settings.discovery_ticketmaster_max_events_total,
            _get_discovery_max_events(),
        ),
    )


def _source_counts(events: list[EventResponse]) -> dict[str, int]:
    return dict(Counter((event.source or "unknown").casefold() for event in events))


def _expects_ticketmaster_discovery() -> bool:
    return bool(
        (settings.ticketmaster_api_key or "").strip()
        and settings.discovery_seed_cities
        and _get_ticketmaster_max_events_per_city() > 0
        and not is_ticketmaster_rate_limited()
    )


def _expects_openagenda_discovery() -> bool:
    return bool(
        (settings.openagenda_api_key or "").strip()
        and settings.discovery_openagenda_seed_agenda_uids
        and settings.discovery_openagenda_max_events > 0
    )


def _is_cache_usable() -> bool:
    if not _has_cached_response:
        return False

    if _expects_ticketmaster_discovery() and not _cache_ticketmaster_attempted:
        return False

    if _expects_openagenda_discovery() and not _cache_openagenda_attempted:
        return False

    return True


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


def _normalize_text(value: str) -> str:
    normalized = normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")

    return ascii_value.casefold().strip()


def _dedupe_key(event: EventResponse) -> tuple[str, str, str, str]:
    return (
        _normalize_text(event.source),
        _normalize_text(event.name),
        (event.date or "").strip(),
        _normalize_text(event.venue or event.city),
    )


def _dedupe_events(events: list[EventResponse]) -> list[EventResponse]:
    seen_ids = set()
    seen_keys = set()
    unique_events = []

    for event in events:
        source_id = f"{event.source}:{event.id}" if event.id else ""
        if source_id and source_id in seen_ids:
            continue

        key = _dedupe_key(event)
        if key in seen_keys:
            continue

        if source_id:
            seen_ids.add(source_id)
        seen_keys.add(key)
        unique_events.append(event)

    return unique_events


def _limit_discovery_events(events: list[EventResponse]) -> list[EventResponse]:
    max_events = _get_discovery_max_events()

    if len(events) <= max_events:
        return events

    events_by_source: dict[str, list[EventResponse]] = {}
    for event in events:
        source = (event.source or "unknown").casefold()
        events_by_source.setdefault(source, []).append(event)

    balanced_sources = [
        source
        for source in ("shotgun", "ticketmaster", "openagenda")
        if events_by_source.get(source)
    ]

    if len(balanced_sources) < 2:
        return events[:max_events]

    selected_events = []
    selected_ids = set()
    source_quota = max(1, max_events // len(balanced_sources))

    for source in balanced_sources:
        for event in events_by_source[source][:source_quota]:
            selected_events.append(event)
            selected_ids.add(id(event))

    if len(selected_events) >= max_events:
        return sorted(selected_events[:max_events], key=_event_sort_key)

    for event in events:
        if id(event) in selected_ids:
            continue

        selected_events.append(event)
        if len(selected_events) >= max_events:
            break

    return sorted(selected_events, key=_event_sort_key)


def _limit_ticketmaster_city_results(
    city_results: list[list[EventResponse]],
) -> list[EventResponse]:
    max_events = _get_ticketmaster_max_events_total()
    selected_events = []
    max_city_events = max((len(events) for events in city_results), default=0)

    for index in range(max_city_events):
        for events in city_results:
            if index >= len(events):
                continue

            selected_events.append(events[index])
            if len(selected_events) >= max_events:
                return selected_events

    return selected_events


def _filter_discovery_events(events: list[EventResponse]) -> list[EventResponse]:
    future_events = [event for event in events if _is_future_event(event)]
    geolocated_events = [
        event
        for event in future_events
        if _is_valid_coordinate(event.latitude, event.longitude)
    ]
    deduped_events = sorted(_dedupe_events(geolocated_events), key=_event_sort_key)
    discovery_events = _limit_discovery_events(deduped_events)

    logger.info(
        "Discovery filter raw=%s future=%s geolocated=%s deduped=%s final=%s "
        "raw_sources=%s geolocated_sources=%s final_sources=%s "
        "ticketmaster_geolocated=%s ticketmaster_final=%s",
        len(events),
        len(future_events),
        len(geolocated_events),
        len(deduped_events),
        len(discovery_events),
        _source_counts(events),
        _source_counts(geolocated_events),
        _source_counts(discovery_events),
        _source_counts(geolocated_events).get("ticketmaster", 0),
        _source_counts(discovery_events).get("ticketmaster", 0),
    )

    return discovery_events


async def _get_shotgun_discovery_events() -> list[EventResponse]:
    events = await search_shotgun_events(
        max_events=_get_shotgun_max_events(),
        months_ahead=_get_discovery_months_ahead(),
    )
    logger.info("Discovery Shotgun loaded events=%s", len(events))

    return events


async def _get_ticketmaster_city_events(city: str) -> list[EventResponse]:
    async with _ticketmaster_semaphore:
        return await search_events_by_city_for_discovery(
            city,
            max_events=_get_ticketmaster_max_events_per_city(),
            months_ahead=_get_discovery_months_ahead(),
        )


async def _get_ticketmaster_discovery_events() -> list[EventResponse]:
    seed_cities = settings.discovery_seed_cities
    if is_ticketmaster_rate_limited():
        logger.warning("Ticketmaster rate limited; temporarily skipping provider.")
        return []

    logger.info(
        "Discovery Ticketmaster seed cities=%s max_per_city=%s months_ahead=%s",
        seed_cities,
        _get_ticketmaster_max_events_per_city(),
        _get_discovery_months_ahead(),
    )

    city_results = await asyncio.gather(
        *[_get_ticketmaster_city_events(city) for city in seed_cities],
        return_exceptions=True,
    )
    successful_city_events = []
    rate_limit_logged = False

    for city, result in zip(seed_cities, city_results):
        if isinstance(result, BaseException):
            if isinstance(result, TicketmasterRateLimitError):
                if not rate_limit_logged:
                    logger.warning(
                        "Ticketmaster rate limited; temporarily skipping provider."
                    )
                    rate_limit_logged = True
                continue

            logger.warning(
                "Discovery Ticketmaster city failed city=%s error_type=%s error=%s",
                city,
                type(result).__name__,
                _safe_error_message(result),
            )
            continue

        logger.info(
            "Discovery Ticketmaster city loaded city=%s events=%s",
            city,
            len(result),
        )
        successful_city_events.append(result)

    events = _limit_ticketmaster_city_results(successful_city_events)

    logger.info(
        "Discovery Ticketmaster loaded events=%s raw_events=%s successful_cities=%s "
        "failed_cities=%s max_total=%s",
        len(events),
        sum(len(result) for result in successful_city_events),
        sum(1 for result in city_results if not isinstance(result, BaseException)),
        sum(1 for result in city_results if isinstance(result, BaseException)),
        _get_ticketmaster_max_events_total(),
    )

    return events


async def _get_openagenda_discovery_events() -> list[EventResponse]:
    events = await search_openagenda_discovery_events()
    logger.info(
        "Discovery OpenAgenda loaded events=%s agenda_uids=%s",
        len(events),
        settings.discovery_openagenda_seed_agenda_uids,
    )

    return events


async def get_discovery_events() -> list[EventResponse]:
    global _cached_events, _cache_expires_at, _has_cached_response
    global _cache_ticketmaster_attempted, _cache_openagenda_attempted

    now = monotonic()
    if _has_cached_response and now < _cache_expires_at and _is_cache_usable():
        logger.info(
            "Discovery cache hit events=%s ttl_remaining_seconds=%s sources=%s",
            len(_cached_events),
            int(_cache_expires_at - now),
            _source_counts(_cached_events),
        )
        return _cached_events

    async with _refresh_lock:
        now = monotonic()
        if _has_cached_response and now < _cache_expires_at and _is_cache_usable():
            logger.info(
                "Discovery cache hit after wait events=%s ttl_remaining_seconds=%s "
                "sources=%s",
                len(_cached_events),
                int(_cache_expires_at - now),
                _source_counts(_cached_events),
            )
            return _cached_events

        if _has_cached_response and now < _cache_expires_at:
            logger.info(
                "Discovery cache bypassed events=%s ttl_remaining_seconds=%s "
                "sources=%s ticketmaster_attempted=%s openagenda_attempted=%s",
                len(_cached_events),
                int(_cache_expires_at - now),
                _source_counts(_cached_events),
                _cache_ticketmaster_attempted,
                _cache_openagenda_attempted,
            )

        results = await asyncio.gather(
            _get_shotgun_discovery_events(),
            _get_ticketmaster_discovery_events(),
            _get_openagenda_discovery_events(),
            return_exceptions=True,
        )
        events = []
        errors = []

        for result in results:
            if isinstance(result, BaseException):
                errors.append(result)
                continue

            events.extend(result)

        logger.info(
            "Discovery provider response raw_events=%s raw_sources=%s "
            "provider_errors=%s",
            len(events),
            _source_counts(events),
            [type(error).__name__ for error in errors],
        )

        if events:
            discovery_events = _filter_discovery_events(events)
            if discovery_events:
                _cached_events = discovery_events
                _has_cached_response = True
                _cache_ticketmaster_attempted = not is_ticketmaster_rate_limited()
                _cache_openagenda_attempted = True
                _cache_expires_at = now + _get_discovery_cache_ttl_seconds()
                logger.info(
                    "Discovery cache refreshed events=%s ttl_seconds=%s sources=%s",
                    len(discovery_events),
                    _get_discovery_cache_ttl_seconds(),
                    _source_counts(discovery_events),
                )

                return discovery_events

        if _has_cached_response:
            logger.warning(
                "Discovery returning previous cache events=%s sources=%s",
                len(_cached_events),
                _source_counts(_cached_events),
            )
            return _cached_events

        if errors:
            error_messages = "; ".join(
                _safe_error_message(error)
                for error in errors
                if isinstance(
                    error,
                    (
                        ShotgunAPIError,
                        TicketmasterAPIError,
                        OpenAgendaAPIError,
                        ValueError,
                    ),
                )
                and str(error)
            )
            raise DiscoveryAPIError(
                error_messages or "Could not load discovery events."
            )

        raise DiscoveryAPIError("No discovery events available.")
