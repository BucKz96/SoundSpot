import httpx

from app.core.config import settings
from app.schemas.event import EventResponse

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


def _ticketmaster_event_to_response(raw: dict) -> EventResponse:
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

    return EventResponse(
        id=str(raw.get("id") or ""),
        name=raw.get("name") or "Event",
        artist=artist,
        city=city_obj.get("name") or "",
        country=country_obj.get("countryCode")
        or country_obj.get("name")
        or "",
        venue=venue.get("name") or "TBA",
        date=local_date,
        time=local_time,
        latitude=_safe_float(location.get("latitude")),
        longitude=_safe_float(location.get("longitude")),
        ticket_url=raw.get("url") or "",
    )


def _search_ticketmaster_events(search_params: dict[str, object]) -> list[EventResponse]:
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
        with httpx.Client(timeout=30.0) as client:
            response = client.get(TICKETMASTER_EVENTS_URL, params=params)
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

    return [_ticketmaster_event_to_response(item) for item in events_raw]


def search_events_by_city(city: str) -> list[EventResponse]:
    return _search_ticketmaster_events({"city": city})


def search_events_by_artist(artist: str) -> list[EventResponse]:
    return _search_ticketmaster_events({"keyword": artist})
