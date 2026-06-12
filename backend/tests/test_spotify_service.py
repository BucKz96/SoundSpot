import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.schemas.artist import ArtistResponse
from app.services.spotify_service import (
    SpotifyAPIError,
    SpotifyCredentialsError,
    SpotifyNoReliableMatchError,
    SpotifyRateLimitError,
    SpotifyService,
)


def make_response(
    status_code: int,
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return httpx.Response(
        status_code,
        json=payload or {},
        headers=headers,
        request=httpx.Request("GET", "https://api.spotify.test"),
    )


def spotify_artist(name: str = "Daft Punk") -> dict:
    return {
        "id": "4tZwfgrHOc3mvqYlEYSvVi",
        "name": name,
        "external_urls": {
            "spotify": "https://open.spotify.com/artist/example"
        },
        "images": [{"url": "https://images.spotify.test/artist.jpg"}],
        "genres": ["electro", "filter house"],
        "popularity": 82,
        "followers": {"total": 1234567},
    }


class FakeAsyncClient:
    def __init__(self, actions: list[httpx.Response | Exception]) -> None:
        self.actions = actions

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None

    def _next(self) -> httpx.Response:
        action = self.actions.pop(0)
        if isinstance(action, Exception):
            raise action
        return action

    async def post(self, *args, **kwargs) -> httpx.Response:
        return self._next()

    async def get(self, *args, **kwargs) -> httpx.Response:
        return self._next()


class FakeClientFactory:
    def __init__(self, actions: list[httpx.Response | Exception]) -> None:
        self.actions = actions

    def __call__(self, **kwargs) -> FakeAsyncClient:
        return FakeAsyncClient(self.actions)


class SpotifyServiceTests(unittest.IsolatedAsyncioTestCase):
    def make_service(
        self,
        actions: list[httpx.Response | Exception],
        clock=lambda: 1000.0,
    ) -> SpotifyService:
        return SpotifyService(
            client_id="client-id",
            client_secret="client-secret",
            client_factory=FakeClientFactory(actions),
            clock=clock,
        )

    async def test_success_returns_normalized_artist(self) -> None:
        actions = [
            make_response(
                200,
                {"access_token": "token-1", "expires_in": 3600},
            ),
            make_response(
                200,
                {"artists": {"items": [spotify_artist()]}},
            ),
        ]

        result = await self.make_service(actions).search_artist("Daft Punk")

        self.assertEqual(result.id, "4tZwfgrHOc3mvqYlEYSvVi")
        self.assertEqual(result.name, "Daft Punk")
        self.assertEqual(result.provider, "spotify")
        self.assertEqual(result.followers, 1234567)
        self.assertEqual(result.genres, ["electro", "filter house"])
        self.assertEqual(actions, [])

    async def test_empty_result_raises_not_found(self) -> None:
        actions = [
            make_response(200, {"access_token": "token", "expires_in": 3600}),
            make_response(200, {"artists": {"items": []}}),
        ]

        with self.assertRaises(SpotifyNoReliableMatchError):
            await self.make_service(actions).search_artist("Missing Artist")

    async def test_doubtful_match_is_rejected(self) -> None:
        actions = [
            make_response(200, {"access_token": "token", "expires_in": 3600}),
            make_response(
                200,
                {"artists": {"items": [spotify_artist("Daft Punk Tribute")]}},
            ),
        ]

        with self.assertRaises(SpotifyNoReliableMatchError):
            await self.make_service(actions).search_artist("Daft Punk")

    async def test_missing_credentials_raise_service_unavailable_error(self) -> None:
        service = SpotifyService(client_id="", client_secret="")

        with self.assertRaises(SpotifyCredentialsError):
            await service.search_artist("Daft Punk")

    async def test_expired_token_is_refreshed(self) -> None:
        current_time = [1000.0]
        actions = [
            make_response(200, {"access_token": "token-1", "expires_in": 100}),
            make_response(
                200,
                {"artists": {"items": [spotify_artist()]}},
            ),
            make_response(200, {"access_token": "token-2", "expires_in": 100}),
            make_response(
                200,
                {"artists": {"items": [spotify_artist()]}},
            ),
        ]
        service = self.make_service(actions, clock=lambda: current_time[0])

        await service.search_artist("Daft Punk")
        current_time[0] = 1091.0
        await service.search_artist("Daft Punk")

        self.assertEqual(service._access_token, "token-2")
        self.assertEqual(actions, [])

    async def test_401_refreshes_token_once_and_retries(self) -> None:
        actions = [
            make_response(200, {"access_token": "token-1", "expires_in": 3600}),
            make_response(401),
            make_response(200, {"access_token": "token-2", "expires_in": 3600}),
            make_response(
                200,
                {"artists": {"items": [spotify_artist()]}},
            ),
        ]
        service = self.make_service(actions)

        result = await service.search_artist("Daft Punk")

        self.assertEqual(result.name, "Daft Punk")
        self.assertEqual(service._access_token, "token-2")
        self.assertEqual(actions, [])

    async def test_second_401_is_reported_as_bad_gateway_error(self) -> None:
        actions = [
            make_response(200, {"access_token": "token-1", "expires_in": 3600}),
            make_response(401),
            make_response(200, {"access_token": "token-2", "expires_in": 3600}),
            make_response(401),
        ]

        with self.assertRaises(SpotifyAPIError):
            await self.make_service(actions).search_artist("Daft Punk")

    async def test_429_preserves_retry_after(self) -> None:
        actions = [
            make_response(200, {"access_token": "token", "expires_in": 3600}),
            make_response(429, headers={"Retry-After": "30"}),
        ]

        with self.assertRaises(SpotifyRateLimitError) as context:
            await self.make_service(actions).search_artist("Daft Punk")

        self.assertEqual(context.exception.retry_after, "30")

    async def test_spotify_5xx_raises_bad_gateway_error(self) -> None:
        actions = [
            make_response(200, {"access_token": "token", "expires_in": 3600}),
            make_response(503),
        ]

        with self.assertRaises(SpotifyAPIError):
            await self.make_service(actions).search_artist("Daft Punk")


class SpotifyArtistRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_route_requires_name(self) -> None:
        response = self.client.get("/api/artists/spotify/search")

        self.assertEqual(response.status_code, 422)

    def test_route_rejects_blank_name(self) -> None:
        response = self.client.get(
            "/api/artists/spotify/search",
            params={"name": "   "},
        )

        self.assertEqual(response.status_code, 400)

    def test_route_returns_artist_response(self) -> None:
        artist = ArtistResponse(
            id="artist-id",
            name="Daft Punk",
            spotify_url="https://open.spotify.com/artist/example",
            image_url="https://images.spotify.test/artist.jpg",
            genres=["electro"],
            popularity=82,
            followers=1234567,
        )

        with patch(
            "app.api.routes.artists.search_spotify_artist",
            new=AsyncMock(return_value=artist),
        ):
            response = self.client.get(
                "/api/artists/spotify/search",
                params={"name": "Daft Punk"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "spotify")
        self.assertEqual(response.json()["name"], "Daft Punk")

    def test_route_returns_retry_after_header(self) -> None:
        with patch(
            "app.api.routes.artists.search_spotify_artist",
            new=AsyncMock(side_effect=SpotifyRateLimitError("45")),
        ):
            response = self.client.get(
                "/api/artists/spotify/search",
                params={"name": "Daft Punk"},
            )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "45")

    def test_route_maps_missing_credentials_to_503(self) -> None:
        with patch(
            "app.api.routes.artists.search_spotify_artist",
            new=AsyncMock(
                side_effect=SpotifyCredentialsError(
                    "Spotify credentials are not configured."
                )
            ),
        ):
            response = self.client.get(
                "/api/artists/spotify/search",
                params={"name": "Daft Punk"},
            )

        self.assertEqual(response.status_code, 503)

    def test_route_maps_no_match_to_404(self) -> None:
        with patch(
            "app.api.routes.artists.search_spotify_artist",
            new=AsyncMock(
                side_effect=SpotifyNoReliableMatchError(
                    "No reliable Spotify match found for this artist."
                )
            ),
        ):
            response = self.client.get(
                "/api/artists/spotify/search",
                params={"name": "Daft Punk"},
            )

        self.assertEqual(response.status_code, 404)

    def test_route_maps_spotify_failure_to_502(self) -> None:
        with patch(
            "app.api.routes.artists.search_spotify_artist",
            new=AsyncMock(side_effect=SpotifyAPIError("Spotify API error.")),
        ):
            response = self.client.get(
                "/api/artists/spotify/search",
                params={"name": "Daft Punk"},
            )

        self.assertEqual(response.status_code, 502)


if __name__ == "__main__":
    unittest.main()
