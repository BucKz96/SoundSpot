import uuid
from datetime import date as DateType
from datetime import datetime
from datetime import time as TimeType

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
)


class EventFavoriteCreate(BaseModel):
    event_id: str = Field(min_length=1, max_length=255)
    source: str = Field(min_length=1, max_length=50)
    event_name: str = Field(min_length=1, max_length=500)
    artist: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=255)
    venue: str | None = Field(default=None, max_length=500)
    date: DateType | None = None
    time: TimeType | None = None
    ticket_url: HttpUrl | None = None
    image_url: HttpUrl | None = None

    @field_validator("event_id", "event_name")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Field cannot be blank.")
        return normalized

    @field_validator("source")
    @classmethod
    def normalize_source(cls, value: str) -> str:
        normalized = value.strip().casefold()
        if not normalized:
            raise ValueError("Field cannot be blank.")
        return normalized

    @field_validator("artist", "city", "country", "venue")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class EventFavoriteResponse(BaseModel):
    id: uuid.UUID
    event_id: str
    source: str
    event_name: str
    artist: str | None
    city: str | None
    country: str | None
    venue: str | None
    date: DateType | None = Field(validation_alias="event_date")
    time: TimeType | None = Field(validation_alias="event_time")
    ticket_url: str | None
    image_url: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FavoriteDeleteResponse(BaseModel):
    message: str
