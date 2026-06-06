import asyncio
from unicodedata import normalize

from app.schemas.event import EventResponse
from app.services.openagenda_service import search_openagenda_events_by_city
from app.services.shotgun_service import search_shotgun_events
from app.services.ticketmaster_service import search_events_by_city


class EventAggregationError(Exception):
    pass


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


async def search_events_by_city_across_sources(city: str) -> list[EventResponse]:
    results = await asyncio.gather(
        search_events_by_city(city),
        search_shotgun_events(city),
        search_openagenda_events_by_city(city),
        return_exceptions=True,
    )
    events: list[EventResponse] = []
    errors: list[BaseException] = []

    for result in results:
        if isinstance(result, BaseException):
            errors.append(result)
            continue

        events.extend(result)

    if events:
        return _sort_events_by_date(_dedupe_events(events))

    if errors:
        error_messages = "; ".join(str(error) for error in errors if str(error))
        raise EventAggregationError(error_messages or "Could not search event sources.")

    return []
