from fastapi import APIRouter, HTTPException

from app.schemas.event import EventResponse
from app.services.ticketmaster_service import (
    TicketmasterAPIError,
    search_events_by_artist,
    search_events_by_city,
)
from app.utils.city_normalizer import normalize_city_name

router = APIRouter(prefix="/events", tags=["events"])


def get_mock_events() -> list[EventResponse]:
    return [
        EventResponse(
            id="evt-001",
            name="Electro Night Paris",
            artist="Nova Pulse",
            city="Paris",
            country="France",
            venue="Le Dome",
            date="2026-06-14",
            time="20:00",
            latitude=48.8566,
            longitude=2.3522,
            ticket_url="https://example.com/tickets/evt-001",
        ),
        EventResponse(
            id="evt-002",
            name="Sunset Pop Live",
            artist="Luna Waves",
            city="Lyon",
            country="France",
            venue="Arena Lumiere",
            date="2026-06-21",
            time="19:30",
            latitude=45.764,
            longitude=4.8357,
            ticket_url="https://example.com/tickets/evt-002",
        ),
        EventResponse(
            id="evt-003",
            name="Indie Sessions",
            artist="The Urban Trees",
            city="Berlin",
            country="Germany",
            venue="River Hall",
            date="2026-06-30",
            time="21:00",
            latitude=52.52,
            longitude=13.405,
            ticket_url="https://example.com/tickets/evt-003",
        ),
    ]


@router.get("", response_model=list[EventResponse])
def list_events() -> list[EventResponse]:
    return get_mock_events()


@router.get("/search", response_model=list[EventResponse])
async def search_events(
    city: str | None = None,
    artist: str | None = None,
) -> list[EventResponse]:
    try:
        if city and city.strip():
            city_query = normalize_city_name(city)
            return await search_events_by_city(city_query)

        if artist and artist.strip():
            return await search_events_by_artist(artist.strip())

        return get_mock_events()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TicketmasterAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
