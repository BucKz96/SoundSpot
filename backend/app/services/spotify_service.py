import time
from collections.abc import Callable
from unicodedata import normalize

import httpx

from app.core.config import settings
from app.schemas.artist import ArtistResponse

SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ARTIST_SEARCH_URL = "https://api.spotify.com/v1/search"
SPOTIFY_SEARCH_LIMIT = 5
TOKEN_EXPIRY_SAFETY_SECONDS = 60


class SpotifyError(Exception):
    """Base exception for Spotify integration failures."""


class SpotifyCredentialsError(SpotifyError):
    """Raised when Spotify client credentials are not configured."""


class SpotifyNoReliableMatchError(SpotifyError):
    """Raised when Spotify returns no exact normalized artist match."""


class SpotifyRateLimitError(SpotifyError):
    """Raised when Spotify rate limits a request."""

    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__("Spotify rate limit exceeded.")
        self.retry_after = retry_after


class SpotifyAPIError(SpotifyError):
    """Raised when Spotify authentication or API requests fail."""


def _normalize_artist_name(value: str) -> str:
    normalized = normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_value.casefold().split())


def _first_image_url(artist: dict) -> str:
    images = artist.get("images")
    if not isinstance(images, list):
        return ""

    for image in images:
        if isinstance(image, dict) and isinstance(image.get("url"), str):
            return image["url"]

    return ""


def _safe_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _artist_to_response(artist: dict) -> ArtistResponse:
    external_urls = artist.get("external_urls")
    followers = artist.get("followers")

    spotify_url = (
        external_urls.get("spotify", "")
        if isinstance(external_urls, dict)
        else ""
    )
    follower_count = (
        followers.get("total", 0)
        if isinstance(followers, dict)
        else 0
    )
    genres = artist.get("genres")

    return ArtistResponse(
        id=str(artist.get("id") or ""),
        name=str(artist.get("name") or ""),
        spotify_url=str(spotify_url or ""),
        image_url=_first_image_url(artist),
        genres=[
            genre
            for genre in genres
            if isinstance(genre, str) and genre.strip()
        ]
        if isinstance(genres, list)
        else [],
        popularity=_safe_int(artist.get("popularity")),
        followers=_safe_int(follower_count),
    )


class SpotifyService:
    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.client_id = (
            settings.spotify_client_id if client_id is None else client_id
        ).strip()
        self.client_secret = (
            settings.spotify_client_secret
            if client_secret is None
            else client_secret
        ).strip()
        self._client_factory = client_factory
        self._clock = clock
        self._access_token = ""
        self._token_expires_at = 0.0

    def _require_credentials(self) -> None:
        if not self.client_id or not self.client_secret:
            raise SpotifyCredentialsError(
                "Spotify credentials are not configured."
            )

    def _has_valid_token(self) -> bool:
        return bool(
            self._access_token and self._clock() < self._token_expires_at
        )

    def _invalidate_token(self) -> None:
        self._access_token = ""
        self._token_expires_at = 0.0

    async def _request_access_token(self) -> str:
        self._require_credentials()

        try:
            async with self._client_factory(timeout=15.0) as client:
                response = await client.post(
                    SPOTIFY_TOKEN_URL,
                    data={"grant_type": "client_credentials"},
                    auth=(self.client_id, self.client_secret),
                )
        except httpx.RequestError as exc:
            raise SpotifyAPIError(
                "Could not reach Spotify authentication."
            ) from exc

        if response.status_code == 429:
            raise SpotifyRateLimitError(response.headers.get("Retry-After"))
        if response.status_code >= 400:
            raise SpotifyAPIError(
                f"Spotify authentication failed (HTTP {response.status_code})."
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise SpotifyAPIError(
                "Spotify authentication returned invalid JSON."
            ) from exc

        if not isinstance(payload, dict):
            raise SpotifyAPIError(
                "Spotify authentication returned an invalid response."
            )

        token = payload.get("access_token")
        expires_in = payload.get("expires_in")
        if not isinstance(token, str) or not token:
            raise SpotifyAPIError(
                "Spotify authentication response did not include a token."
            )

        try:
            lifetime = max(0, int(expires_in))
        except (TypeError, ValueError):
            lifetime = 3600

        safety_window = min(TOKEN_EXPIRY_SAFETY_SECONDS, lifetime * 0.1)
        self._access_token = token
        self._token_expires_at = self._clock() + max(
            0, lifetime - safety_window
        )
        return token

    async def _get_access_token(self) -> str:
        if self._has_valid_token():
            return self._access_token
        return await self._request_access_token()

    async def _search(self, name: str, token: str) -> httpx.Response:
        try:
            async with self._client_factory(timeout=15.0) as client:
                return await client.get(
                    SPOTIFY_ARTIST_SEARCH_URL,
                    params={
                        "q": name,
                        "type": "artist",
                        "limit": SPOTIFY_SEARCH_LIMIT,
                    },
                    headers={"Authorization": f"Bearer {token}"},
                )
        except httpx.RequestError as exc:
            raise SpotifyAPIError("Could not reach Spotify API.") from exc

    @staticmethod
    def _handle_search_error(response: httpx.Response) -> None:
        if response.status_code == 429:
            raise SpotifyRateLimitError(response.headers.get("Retry-After"))
        if response.status_code >= 400:
            raise SpotifyAPIError(
                f"Spotify API error (HTTP {response.status_code})."
            )

    async def search_artist(self, name: str) -> ArtistResponse:
        query = name.strip()
        if not query:
            raise ValueError("Artist name must not be empty.")

        token = await self._get_access_token()
        response = await self._search(query, token)

        if response.status_code == 401:
            self._invalidate_token()
            token = await self._request_access_token()
            response = await self._search(query, token)

        self._handle_search_error(response)

        try:
            payload = response.json()
        except ValueError as exc:
            raise SpotifyAPIError(
                "Spotify API returned invalid JSON."
            ) from exc

        if not isinstance(payload, dict):
            raise SpotifyAPIError(
                "Spotify API returned an invalid artist response."
            )

        artists = payload.get("artists")
        items = artists.get("items") if isinstance(artists, dict) else None
        if not isinstance(items, list):
            raise SpotifyAPIError(
                "Spotify API returned an invalid artist response."
            )

        normalized_query = _normalize_artist_name(query)
        match = next(
            (
                artist
                for artist in items
                if isinstance(artist, dict)
                and _normalize_artist_name(str(artist.get("name") or ""))
                == normalized_query
            ),
            None,
        )
        if match is None:
            raise SpotifyNoReliableMatchError(
                "No reliable Spotify match found for this artist."
            )

        return _artist_to_response(match)


spotify_service = SpotifyService()


async def search_spotify_artist(name: str) -> ArtistResponse:
    return await spotify_service.search_artist(name)
