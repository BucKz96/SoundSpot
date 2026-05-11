from fastapi import APIRouter

from app.schemas.event import EventResponse

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventResponse])
def list_events() -> list[EventResponse]:
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
