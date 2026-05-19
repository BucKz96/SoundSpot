import httpx
from unicodedata import normalize

from app.core.config import settings
from app.schemas.event import EventResponse
from app.services.geocoding_service import encode_geohash, geocode_city

TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"


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
        is_location_approximate=is_location_approximate,
    )


async def _search_ticketmaster_events(
    search_params: dict[str, object],
) -> list[EventResponse]:
    api_key = (settings.ticketmaster_api_key or "").strip()
    if not api_key:
        raise ValueError(
            "Ticketmaster API key is not configured. Set TICKETMASTER_API_KEY in your environment."
        )

    params = {
        "apikey": api_key,
        "classificationName": "Music",
        "size": 50,
        **search_params,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(TICKETMASTER_EVENTS_URL, params=params)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise TicketmasterAPIError(
            f"Ticketmaster API error (HTTP {exc.response.status_code})."
        ) from exc
    except httpx.RequestError as exc:
        raise TicketmasterAPIError("Could not reach Ticketmaster API.") from exc

    data = response.json()
    events_raw = (data.get("_embedded") or {}).get("events") or []
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
            return _dedupe_events(radius_events)

    fallback_events = await _search_ticketmaster_events({"city": city})

    if coordinates:
        keyword_events = await _search_events_by_city_keyword(
            city,
            coordinates.country_code,
        )
        fallback_events = [*fallback_events, *keyword_events]

    return _dedupe_events(fallback_events)


async def search_events_by_artist(artist: str) -> list[EventResponse]:
    return await _search_ticketmaster_events({"keyword": artist})
