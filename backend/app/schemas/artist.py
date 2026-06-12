from typing import Literal

from pydantic import BaseModel, Field


class ArtistResponse(BaseModel):
    id: str
    name: str
    spotify_url: str
    image_url: str
    genres: list[str] = Field(default_factory=list)
    popularity: int
    followers: int
    provider: Literal["spotify"] = "spotify"
