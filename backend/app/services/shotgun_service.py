import calendar
from datetime import date, datetime
from typing import Any
from unicodedata import normalize
from urllib.parse import parse_qs, urlparse

import httpx

from app.core.config import settings
from app.schemas.event import EventResponse
from app.utils.genre_normalizer import normalize_genres

SHOTGUN_MAX_EVENTS_LIMIT = 200


class ShotgunAPIError(Exception):
    pass


def _get_shotgun_max_events() -> int:
    return max(1, min(settings.shotgun_max_events, SHOTGUN_MAX_EVENTS_LIMIT))


def _get_shotgun_search_months_ahead() -> int:
    return max(1, min(settings.shotgun_search_months_ahead, 24))


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])

    return date(year, month, day)


def _safe_float(value: object) -> float:
    if value is None:
        return 0.0

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


def _normalize_search_text(value: str) -> str:
    normalized = normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")

    return ascii_value.casefold().strip()


def _first_present(mapping: dict[str, Any] | None, keys: tuple[str, ...]) -> Any:
    if not isinstance(mapping, dict):
        return None

    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return value

    return None


def _extract_name(value: Any) -> str:
    if isinstance(value, str):
        return value

    if isinstance(value, dict):
        return str(_first_present(value, ("name", "displayName", "title")) or "")

    return ""


def _extract_style_values(value: Any) -> list[str]:
    if isinstance(value, list):
        return [
            name
            for item in value
            if (name := _extract_name(item).strip())
        ]

    name = _extract_name(value).strip()
    return [name] if name else []


def _extract_shotgun_genre_values(event: dict[str, Any]) -> list[str]:
    return [
        *_extract_style_values(event.get("eventTags")),
        *_extract_style_values(event.get("typeOfPlace")),
    ]


def _extract_artist(event: dict[str, Any]) -> str:
    artists = event.get("eventArtists") or []
    if isinstance(artists, list):
        for artist in artists:
            artist_name = _extract_name(artist)
            if artist_name:
                return artist_name

    organizer_name = _extract_name(event.get("organizer"))
    if organizer_name:
        return organizer_name

    return "Various artists"


def _parse_start_time(value: Any) -> tuple[str, str]:
    if not isinstance(value, str) or not value.strip():
        return "", ""

    start_time = value.strip()
    try:
        parsed = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        return parsed.date().isoformat(), parsed.strftime("%H:%M")
    except ValueError:
        pass

    date_part = start_time[:10] if len(start_time) >= 10 else ""
    time_part = start_time[11:16] if len(start_time) >= 16 and start_time[10] == "T" else ""

    return date_part, time_part


def _resolve_coordinates(geolocation: dict[str, Any]) -> tuple[float, float, bool]:
    latitude = _safe_float(geolocation.get("lat"))
    longitude = _safe_float(geolocation.get("lng"))
    if _is_valid_coordinate(latitude, longitude):
        return latitude, longitude, False

    area_latitude = _safe_float(geolocation.get("areaLat"))
    area_longitude = _safe_float(geolocation.get("areaLng"))
    if _is_valid_coordinate(area_latitude, area_longitude):
        return area_latitude, area_longitude, True

    return 0.0, 0.0, False


def _is_cancelled_event(event: dict[str, Any]) -> bool:
    status = str(event.get("status") or "").casefold()
    cancelled_at = event.get("cancelledAt")

    return status == "cancelled" or cancelled_at not in (None, "")


def _event_matches_city(event: dict[str, Any], city: str) -> bool:
    geolocation = event.get("geolocation") or {}
    city_query = _normalize_search_text(city)
    city_values = (
        geolocation.get("city") or "",
        geolocation.get("area") or "",
        geolocation.get("formattedAddress") or "",
    )

    return any(city_query in _normalize_search_text(value) for value in city_values)


def _shotgun_event_to_response(event: dict[str, Any]) -> EventResponse:
    geolocation = event.get("geolocation") or {}
    date_part, time_part = _parse_start_time(event.get("startTime"))
    latitude, longitude, is_location_approximate = _resolve_coordinates(geolocation)
    event_id = event.get("id") or ""

    return EventResponse(
        id=f"shotgun:{event_id}",
        name=event.get("name") or "Event",
        artist=_extract_artist(event),
        city=geolocation.get("city") or geolocation.get("area") or "",
        country=geolocation.get("country") or "",
        venue=(
            geolocation.get("placeName")
            or geolocation.get("formattedAddress")
            or geolocation.get("street")
            or "Venue TBA"
        ),
        date=date_part,
        time=time_part,
        latitude=latitude,
        longitude=longitude,
        ticket_url=event.get("url") or "",
        is_location_approximate=is_location_approximate,
        source="shotgun",
        genres=normalize_genres(_extract_shotgun_genre_values(event)),
    )


def _extract_events(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("events", "data", "results", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested_events = _extract_events(value)
            if nested_events:
                return nested_events

    return []


def _extract_next_cursor(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""

    pagination = payload.get("pagination") or {}
    next_value = pagination.get("next") if isinstance(pagination, dict) else None

    if isinstance(next_value, dict):
        return str(next_value.get("cursor") or "")

    if isinstance(next_value, str) and next_value:
        if next_value.startswith("http"):
            parsed_query = parse_qs(urlparse(next_value).query)
            return (parsed_query.get("cursor") or [""])[0]

        return next_value

    return ""


def _event_sort_key(event: EventResponse) -> tuple[int, str, str]:
    date_part = (event.date or "").strip()
    time_part = (event.time or "").strip()

    if not date_part:
        return (1, "", event.name.casefold())

    return (0, f"{date_part}T{time_part or '00:00'}", event.name.casefold())


async def search_shotgun_events(city: str | None = None) -> list[EventResponse]:
    api_key = (settings.shotgun_api_key or "").strip()
    if not api_key:
        raise ValueError(
            "Shotgun API key is not configured. Set SHOTGUN_API_KEY in your environment."
        )

    today = date.today()
    from_date = today.isoformat()
    to_date = _add_months(today, _get_shotgun_search_months_ahead()).isoformat()
    max_events = _get_shotgun_max_events()
    base_url = (settings.shotgun_api_base_url or "https://api.shotgun.live").rstrip("/")
    events_url = f"{base_url}/events"
    raw_events = []
    cursor = ""
    seen_cursors = set()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            while len(raw_events) < max_events:
                params = {
                    "key": api_key,
                    "from": from_date,
                    "to": to_date,
                }
                if cursor:
                    params["cursor"] = cursor

                response = await client.get(events_url, params=params)
                response.raise_for_status()
                payload = response.json()
                page_events = _extract_events(payload)
                if not page_events:
                    break

                raw_events.extend(page_events)
                if len(raw_events) >= max_events:
                    raw_events = raw_events[:max_events]
                    break

                next_cursor = _extract_next_cursor(payload)
                if not next_cursor or next_cursor in seen_cursors:
                    break

                seen_cursors.add(next_cursor)
                cursor = next_cursor
    except httpx.HTTPStatusError as exc:
        raise ShotgunAPIError(
            f"Shotgun API error (HTTP {exc.response.status_code})."
        ) from exc
    except (httpx.RequestError, ValueError) as exc:
        raise ShotgunAPIError("Could not reach Shotgun API.") from exc

    filtered_events = [
        event
        for event in raw_events
        if not _is_cancelled_event(event)
        and (not city or _event_matches_city(event, city))
    ]
    normalized_events = [_shotgun_event_to_response(event) for event in filtered_events]

    return sorted(normalized_events, key=_event_sort_key)[:max_events]
