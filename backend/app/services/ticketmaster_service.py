import calendar
from datetime import date
from unicodedata import normalize

import httpx

from app.core.config import settings
from app.schemas.event import EventResponse
from app.services.geocoding_service import encode_geohash, geocode_city
from app.utils.genre_normalizer import normalize_genres

TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
TICKETMASTER_PAGE_SIZE = 50
TICKETMASTER_MAX_EVENTS_LIMIT = 150


class TicketmasterAPIError(Exception):
    """Raised when the Ticketmaster API call fails or returns an unexpected error."""


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


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])

    return date(year, month, day)


def _extract_classification_name(value: object) -> str:
    if isinstance(value, dict):
        name = value.get("name")
        if isinstance(name, str):
            return name

    return ""


def _extract_ticketmaster_genre_values(raw: dict) -> list[str]:
    values = []
    classifications = raw.get("classifications") or []
    embedded = raw.get("_embedded") or {}
    attractions = embedded.get("attractions") or []

    for classification in classifications:
        if not isinstance(classification, dict):
            continue

        for key in ("genre", "subGenre", "type", "subType"):
            value = _extract_classification_name(classification.get(key))
            if value:
                values.append(value)

    for attraction in attractions:
        if not isinstance(attraction, dict):
            continue

        attraction_classifications = attraction.get("classifications") or []
        for classification in attraction_classifications:
            if not isinstance(classification, dict):
                continue

            for key in ("genre", "subGenre"):
                value = _extract_classification_name(classification.get(key))
                if value:
                    values.append(value)

    return values


def _extract_ticketmaster_image_url(raw: dict) -> str:
    images = raw.get("images") or []
    if not isinstance(images, list):
        return ""

    valid_images = [
        image
        for image in images
        if isinstance(image, dict) and isinstance(image.get("url"), str)
    ]
    if not valid_images:
        return ""

    best_image = max(
        valid_images,
        key=lambda image: (
            int(image.get("width") or 0) * int(image.get("height") or 0),
            int(image.get("width") or 0),
        ),
    )
    return best_image.get("url", "").strip()


async def _resolve_event_coordinates(
    latitude: float,
    longitude: float,
    city: str,
    country_code: str,
) -> tuple[float, float, bool]:
    if _is_valid_coordinate(latitude, longitude):
        return latitude, longitude, False

    if not city:
        return latitude, longitude, False

    coordinates = await geocode_city(city, country_code)
    if not coordinates:
        return latitude, longitude, False

    return coordinates.latitude, coordinates.longitude, True


async def _ticketmaster_event_to_response(raw: dict) -> EventResponse:
    embedded = raw.get("_embedded") or {}
    venues = embedded.get("venues") or []
    venue = venues[0] if venues else {}

    city_obj = venue.get("city") or {}
    country_obj = venue.get("country") or {}
    location = venue.get("location") or {}

    attractions = embedded.get("attractions") or []
    if attractions:
        artist = attractions[0].get("name") or "Various artists"
    else:
        artist = "Various artists"

    dates = raw.get("dates") or {}
    start = dates.get("start") or {}
    local_date = start.get("localDate") or ""
    local_time = start.get("localTime") or ""
    city = city_obj.get("name") or ""
    country = country_obj.get("countryCode") or country_obj.get("name") or ""
    latitude = _safe_float(location.get("latitude"))
    longitude = _safe_float(location.get("longitude"))
    latitude, longitude, is_location_approximate = await _resolve_event_coordinates(
        latitude,
        longitude,
        city,
        country_obj.get("countryCode") or "",
    )

    return EventResponse(
        id=str(raw.get("id") or ""),
        name=raw.get("name") or "Event",
        artist=artist,
        city=city,
        country=country,
        venue=venue.get("name") or "TBA",
        date=local_date,
        time=local_time,
        latitude=latitude,
        longitude=longitude,
        ticket_url=raw.get("url") or "",
        image_url=_extract_ticketmaster_image_url(raw),
        is_location_approximate=is_location_approximate,
        source="ticketmaster",
        genres=normalize_genres(_extract_ticketmaster_genre_values(raw)),
    )


async def _search_ticketmaster_events(
    search_params: dict[str, object],
    max_events: int | None = None,
) -> list[EventResponse]:
    api_key = (settings.ticketmaster_api_key or "").strip()
    if not api_key:
        raise ValueError(
            "Ticketmaster API key is not configured. Set TICKETMASTER_API_KEY in your environment."
        )

    max_events = _get_ticketmaster_max_events(max_events)
    page_size = min(TICKETMASTER_PAGE_SIZE, max_events)
    base_params = {
        "apikey": api_key,
        "classificationName": "Music",
        "size": page_size,
        **search_params,
    }
    max_pages = max(1, (max_events + page_size - 1) // page_size)
    events_raw = []

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for page_number in range(max_pages):
                response = await client.get(
                    TICKETMASTER_EVENTS_URL,
                    params={**base_params, "page": page_number},
                )
                response.raise_for_status()

                data = response.json()
                page_events = (data.get("_embedded") or {}).get("events") or []
                if not page_events:
                    break

                events_raw.extend(page_events)
                if len(events_raw) >= max_events:
                    events_raw = events_raw[:max_events]
                    break

                page_info = data.get("page") or {}
                total_pages = page_info.get("totalPages")
                if isinstance(total_pages, int) and page_number >= total_pages - 1:
                    break
    except httpx.HTTPStatusError as exc:
        raise TicketmasterAPIError(
            f"Ticketmaster API error (HTTP {exc.response.status_code})."
        ) from exc
    except httpx.RequestError as exc:
        raise TicketmasterAPIError("Could not reach Ticketmaster API.") from exc

    if not events_raw:
        return []

    return [
        await _ticketmaster_event_to_response(item)
        for item in events_raw
    ]


def _dedupe_events(events: list[EventResponse]) -> list[EventResponse]:
    seen_ids = set()
    unique_events = []

    for event in events:
        if event.id and event.id in seen_ids:
            continue

        if event.id:
            seen_ids.add(event.id)

        unique_events.append(event)

    return unique_events


def _get_ticketmaster_max_events(max_events: int | None = None) -> int:
    configured_max_events = (
        settings.ticketmaster_max_events if max_events is None else max_events
    )

    return max(1, min(configured_max_events, TICKETMASTER_MAX_EVENTS_LIMIT))


def _event_sort_key(event: EventResponse) -> tuple[int, str, str]:
    date = (event.date or "").strip()
    time = (event.time or "").strip()

    if not date:
        return (1, "", event.name.casefold())

    return (0, f"{date}T{time or '00:00:00'}", event.name.casefold())


def _sort_events_by_date(events: list[EventResponse]) -> list[EventResponse]:
    return sorted(events, key=_event_sort_key)


def _finalize_events(
    events: list[EventResponse],
    max_events: int | None = None,
) -> list[EventResponse]:
    return _sort_events_by_date(_dedupe_events(events))[
        :_get_ticketmaster_max_events(max_events)
    ]


def _normalize_search_text(value: str) -> str:
    normalized = normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")

    return ascii_value.casefold().strip()


def _event_matches_city_keyword(event: EventResponse, city: str) -> bool:
    city_query = _normalize_search_text(city)

    return city_query in {
        _normalize_search_text(event.city),
        _normalize_search_text(event.venue),
    } or city_query in _normalize_search_text(event.venue)


async def _search_events_by_city_keyword(
    city: str,
    country_code: str,
) -> list[EventResponse]:
    if not country_code:
        return []

    events = await _search_ticketmaster_events(
        {
            "keyword": city,
            "countryCode": country_code,
        }
    )

    return [event for event in events if _event_matches_city_keyword(event, city)]


async def search_events_by_location(
    latitude: float,
    longitude: float,
    radius_km: int = 30,
) -> list[EventResponse]:
    geo_point = encode_geohash(latitude, longitude)

    return await _search_ticketmaster_events(
        {
            "geoPoint": geo_point,
            "radius": radius_km,
            "unit": "km",
            "sort": "distance,asc",
        }
    )


async def search_events_by_city(city: str) -> list[EventResponse]:
    coordinates = await geocode_city(city)

    if coordinates:
        try:
            radius_events = await search_events_by_location(
                coordinates.latitude,
                coordinates.longitude,
                settings.city_search_radius_km,
            )
        except TicketmasterAPIError:
            radius_events = []

        if radius_events:
            return _finalize_events(radius_events)

    fallback_events = await _search_ticketmaster_events({"city": city})

    if coordinates:
        keyword_events = await _search_events_by_city_keyword(
            city,
            coordinates.country_code,
        )
        fallback_events = [*fallback_events, *keyword_events]

    return _finalize_events(fallback_events)


async def search_events_by_city_for_discovery(
    city: str,
    max_events: int,
    months_ahead: int,
) -> list[EventResponse]:
    today = date.today()
    end_date = _add_months(today, max(1, min(months_ahead, 24)))
    events = await _search_ticketmaster_events(
        {
            "city": city,
            "sort": "date,asc",
            "startDateTime": f"{today.isoformat()}T00:00:00Z",
            "endDateTime": f"{end_date.isoformat()}T23:59:59Z",
        },
        max_events=max_events,
    )

    return _finalize_events(events, max_events)


async def search_events_by_artist(artist: str) -> list[EventResponse]:
    events = await _search_ticketmaster_events({"keyword": artist})
    return _finalize_events(events)
