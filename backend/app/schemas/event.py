from pydantic import BaseModel, Field


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
    image_url: str | None = None
    is_location_approximate: bool = False
    source: str = "ticketmaster"
    genres: list[str] = Field(default_factory=list)
