from fastapi import APIRouter, HTTPException, Query, Response

from app.schemas.artist import ArtistResponse
from app.services.spotify_service import (
    SpotifyAPIError,
    SpotifyCredentialsError,
    SpotifyNoReliableMatchError,
    SpotifyRateLimitError,
    search_spotify_artist,
)

router = APIRouter(prefix="/artists", tags=["artists"])


@router.get("/spotify/search", response_model=ArtistResponse)
async def spotify_artist_search(
    response: Response,
    name: str = Query(min_length=1, max_length=200),
) -> ArtistResponse:
    try:
        return await search_spotify_artist(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SpotifyCredentialsError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SpotifyNoReliableMatchError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SpotifyRateLimitError as exc:
        if exc.retry_after:
            response.headers["Retry-After"] = exc.retry_after
        raise HTTPException(
            status_code=429,
            detail="Spotify rate limit exceeded.",
            headers=(
                {"Retry-After": exc.retry_after}
                if exc.retry_after
                else None
            ),
        ) from exc
    except SpotifyAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
