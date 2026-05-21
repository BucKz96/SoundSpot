from pydantic import BaseModel


class EventResponse(BaseModel):
    id: str
    name: str
    artist: str
    city: str
    country: str
    venue: str
    date: str
    time: str
    latitude: float
    longitude: float
    ticket_url: str
    is_location_approximate: bool = False
    source: str = "ticketmaster"
