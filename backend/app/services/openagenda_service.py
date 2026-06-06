from datetime import date, datetime

import httpx

from app.core.config import settings
from app.schemas.event import EventResponse
from app.utils.openagenda_event_classifier import classify_openagenda_event

OPENAGENDA_BASE_URL = "https://api.openagenda.com/v2"
OPENAGENDA_PAGE_SIZE_LIMIT = 100


class OpenAgendaAPIError(Exception):
    pass


def _get_openagenda_max_events() -> int:
    return max(1, min(settings.discovery_openagenda_max_events, 500))


def _safe_float(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _is_valid_coordinate(latitude: float, longitude: float) -> bool:
    return (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
        and not (latitude == 0 and longitude == 0)
    )


def _text(value: object, preferred_language: str = "fr") -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        preferred = value.get(preferred_language)
        if isinstance(preferred, str) and preferred.strip():
            return preferred.strip()
        for item in value.values():
            if isinstance(item, str) and item.strip():
                return item.strip()
    return ""


def _first_timing(raw: dict) -> tuple[str, str]:
    timings = raw.get("timings") or []
    if not timings:
        return "", ""

    first_timing = timings[0]
    begin = first_timing.get("begin") if isinstance(first_timing, dict) else ""
    if not isinstance(begin, str) or not begin:
        return "", ""

    try:
        parsed = datetime.fromisoformat(begin.replace("Z", "+00:00"))
    except ValueError:
        return begin[:10], begin[11:19] if len(begin) >= 19 else ""

    return parsed.date().isoformat(), parsed.time().isoformat(timespec="seconds")


def _is_future_event(raw: dict) -> bool:
    event_date, _ = _first_timing(raw)
    if len(event_date) < 10:
        return False

    try:
        parsed_date = date.fromisoformat(event_date[:10])
    except ValueError:
        return False

    return parsed_date >= date.today()


def _is_cancelled(raw: dict) -> bool:
    values = []
    for key in ("status", "state"):
        value = raw.get(key)
        if isinstance(value, str):
            values.append(value.casefold())

    return any(
        "cancel" in value or "annul" in value or "deleted" in value
        for value in values
    )


def _registration_url(raw: dict) -> str:
    for item in raw.get("registration") or []:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "link":
            continue
        value = item.get("value")
        if isinstance(value, str) and value.strip():
            return value.strip()

    for item in raw.get("links") or []:
        if isinstance(item, dict) and isinstance(item.get("link"), str):
            return item["link"].strip()

    return ""


def _event_url(raw: dict, agenda_slug: str) -> str:
    for key in ("canonicalUrl", "url", "publicUrl"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    event_slug = raw.get("slug")
    if agenda_slug and event_slug:
        return f"https://openagenda.com/{agenda_slug}/events/{event_slug}"

    return _registration_url(raw)


def _event_sort_key(event: EventResponse) -> tuple[str, str, str]:
    return (
        (event.date or "").strip(),
        (event.time or "").strip() or "00:00:00",
        event.name.casefold(),
    )


def _normalize_openagenda_event(raw: dict, agenda_slug: str) -> EventResponse | None:
    if _is_cancelled(raw) or not _is_future_event(raw):
        return None

    classification = classify_openagenda_event(raw)
    if not classification.is_music_event:
        return None

    location = raw.get("location") or {}
    latitude = _safe_float(location.get("latitude"))
    longitude = _safe_float(location.get("longitude"))
    if not _is_valid_coordinate(latitude, longitude):
        return None

    event_date, event_time = _first_timing(raw)
    title = _text(raw.get("title"))
    venue = location.get("name") or location.get("address") or "TBA"

    return EventResponse(
        id=str(raw.get("uid") or ""),
        name=title or "OpenAgenda event",
        artist=title or "Various artists",
        city=location.get("city") or location.get("adminLevel4") or "",
        country=location.get("countryCode") or location.get("country") or "",
        venue=venue,
        date=event_date,
        time=event_time,
        latitude=latitude,
        longitude=longitude,
        ticket_url=_event_url(raw, agenda_slug),
        is_location_approximate=False,
        source="openagenda",
        genres=classification.genres,
    )


async def _get_json(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, object],
) -> dict:
    api_key = (settings.openagenda_api_key or "").strip()
    if not api_key:
        raise ValueError("OpenAgenda API key is not configured. Set OPENAGENDA_API_KEY.")

    try:
        response = await client.get(
            f"{OPENAGENDA_BASE_URL}{path}",
            params=params,
            headers={"key": api_key},
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise OpenAgendaAPIError(
            f"OpenAgenda API error (HTTP {exc.response.status_code})."
        ) from exc
    except httpx.RequestError as exc:
        raise OpenAgendaAPIError("Could not reach OpenAgenda API.") from exc

    data = response.json()
    return data if isinstance(data, dict) else {}


async def _fetch_agenda(client: httpx.AsyncClient, agenda_uid: str) -> dict:
    return await _get_json(
        client,
        f"/agendas/{agenda_uid}",
        {"includeFields[]": ["uid", "slug", "title"]},
    )


async def _fetch_agenda_events(
    client: httpx.AsyncClient,
    agenda_uid: str,
    max_events: int,
) -> list[dict]:
    data = await _get_json(
        client,
        f"/agendas/{agenda_uid}/events",
        {
            "relative[]": ["current", "upcoming"],
            "size": min(max_events, OPENAGENDA_PAGE_SIZE_LIMIT),
            "includeFields[]": [
                "uid",
                "slug",
                "title",
                "description",
                "longDescription",
                "keywords",
                "timings",
                "location",
                "registration",
                "links",
                "status",
                "state",
            ],
        },
    )

    return [event for event in data.get("events") or [] if isinstance(event, dict)]


async def search_openagenda_discovery_events() -> list[EventResponse]:
    agenda_uids = settings.discovery_openagenda_seed_agenda_uids
    if not agenda_uids:
        return []

    max_events = _get_openagenda_max_events()
    events = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for agenda_uid in agenda_uids:
            try:
                agenda = await _fetch_agenda(client, agenda_uid)
                agenda_slug = agenda.get("slug") or ""
                raw_events = await _fetch_agenda_events(client, agenda_uid, max_events)
            except OpenAgendaAPIError:
                continue

            for raw_event in raw_events:
                event = _normalize_openagenda_event(raw_event, agenda_slug)
                if event is not None:
                    events.append(event)
                if len(events) >= max_events:
                    return sorted(events, key=_event_sort_key)

    return sorted(events, key=_event_sort_key)[:max_events]
